package api

import (
	"errors"
	"time"

	"github.com/blang/semver"
	"github.com/doug-martin/goqu/v9"
)

var (
	// ErrRegisterInstanceFailed indicates that the instance registration did
	// not succeed.
	ErrRegisterInstanceFailed = errors.New("nebraska: register instance failed")

	// ErrUpdateInProgressOnInstance indicates that an update is currently in
	// progress on the instance requesting an update package, so the request
	// will be rejected.
	ErrUpdateInProgressOnInstance = errors.New("nebraska: update in progress on instance")

	// ErrNoPackageFound indicates that the group doesn't have a channel
	// assigned or that the channel doesn't have a package assigned.
	ErrNoPackageFound = errors.New("nebraska: no package found")

	// ErrNoUpdatePackageAvailable indicates that the instance requesting the
	// update has already the latest version of the application.
	ErrNoUpdatePackageAvailable = errors.New("nebraska: no update package available")

	// ErrUpdatesDisabled indicates that updates are not enabled in the group.
	ErrUpdatesDisabled = errors.New("nebraska: updates disabled")

	// ErrGetUpdatesStatsFailed indicates that there was a problem getting the
	// updates stats of the group which are needed to enforce the rollout
	// policy.
	ErrGetUpdatesStatsFailed = errors.New("nebraska: get updates stats failed")

	// ErrMaxUpdatesPerPeriodLimitReached indicates that the maximum number of
	// updates per period has been reached.
	ErrMaxUpdatesPerPeriodLimitReached = errors.New("nebraska: max updates per period limit reached")

	// ErrMaxConcurrentUpdatesLimitReached indicates that the maximum number of
	// concurrent updates has been reached.
	ErrMaxConcurrentUpdatesLimitReached = errors.New("nebraska: max concurrent updates limit reached")

	// ErrMaxTimedOutUpdatesLimitReached indicates that limit of instances that
	// timed out while updating has been reached.
	ErrMaxTimedOutUpdatesLimitReached = errors.New("nebraska: max timed out updates limit reached")

	// ErrGrantingUpdate indicates that something went wrong while granting an
	// update.
	ErrGrantingUpdate = errors.New("nebraska: error granting update")
)

// GetUpdatePackage returns an update package for the instance/application
// provided. The instance details and the application it's running will be
// registered in Nebraska (or updated if it's already registered).
func (api *API) GetUpdatePackage(instanceID, instanceIP, instanceVersion, appID, groupID string) (*Package, error) {
	instance, err := api.RegisterInstance(instanceID, instanceIP, instanceVersion, appID, groupID)
	if err != nil {
		return nil, ErrRegisterInstanceFailed
	}
	updateAlreadyGranted := false

	if instance.Application.Status.Valid {
		switch int(instance.Application.Status.Int64) {
		case InstanceStatusDownloading, InstanceStatusDownloaded, InstanceStatusInstalled:
			return nil, ErrUpdateInProgressOnInstance
		case InstanceStatusUpdateGranted:
			updateAlreadyGranted = true
		}
	}

	group, err := api.GetGroup(groupID)
	if err != nil {
		return nil, err
	}

	if group.Channel == nil || group.Channel.Package == nil {
		_ = api.newGroupActivityEntry(activityPackageNotFound, activityWarning, "0.0.0", appID, groupID)
		return nil, ErrNoPackageFound
	}

	for _, blacklistedChannelID := range group.Channel.Package.ChannelsBlacklist {
		if blacklistedChannelID == group.Channel.ID {
			if updateAlreadyGranted {
				// TODO: Log any error
				_ = api.updateInstanceStatus(instance.ID, appID, InstanceStatusComplete)
			}
			return nil, ErrNoUpdatePackageAvailable
		}
	}

	instanceSemver, _ := semver.Make(instanceVersion)
	packageSemver, _ := semver.Make(group.Channel.Package.Version)
	if !instanceSemver.LT(packageSemver) {
		if updateAlreadyGranted {
			// TODO: Log any error
			_ = api.updateInstanceStatus(instance.ID, appID, InstanceStatusComplete)
		}
		return nil, ErrNoUpdatePackageAvailable
	}

	if updateAlreadyGranted {
		return group.Channel.Package, nil
	}

	updatesStats, err := api.getGroupUpdatesStats(group)
	if err != nil {
		return nil, ErrGetUpdatesStatsFailed
	}

	if err := api.enforceRolloutPolicy(instance, group, updatesStats); err != nil {
		return nil, err
	}

	if err := api.grantUpdate(instance.ID, appID, group.Channel.Package.Version); err != nil {
		return nil, ErrGrantingUpdate
	}

	if updatesStats.UpdatesToCurrentVersionGranted == 0 {
		_ = api.newGroupActivityEntry(activityRolloutStarted, activityInfo, group.Channel.Package.Version, appID, group.ID)
	}

	if !group.RolloutInProgress {
		_ = api.setGroupRolloutInProgress(groupID, true)
	}

	_ = api.updateInstanceStatus(instance.ID, appID, InstanceStatusUpdateGranted)

	return group.Channel.Package, nil
}

// enforceRolloutPolicy validates if an update should be provided to the
// requesting instance based on the group rollout policy and the current status
// of the updates taking place in the group.
func (api *API) enforceRolloutPolicy(instance *Instance, group *Group, updatesStats *UpdatesStats) error {
	appID := instance.Application.ApplicationID

	if !group.PolicyUpdatesEnabled {
		return ErrUpdatesDisabled
	}

	if group.PolicyOfficeHours && !inOfficeHoursNow(group.PolicyTimezone.String) {
		return ErrUpdatesDisabled
	}

	effectiveMaxUpdates := group.PolicyMaxUpdatesPerPeriod
	if group.PolicySafeMode && updatesStats.UpdatesToCurrentVersionAttempted == 0 {
		effectiveMaxUpdates = 1
	}

	if updatesStats.UpdatesGrantedInLastPeriod >= effectiveMaxUpdates {
		_ = api.updateInstanceStatus(instance.ID, appID, InstanceStatusOnHold)
		return ErrMaxUpdatesPerPeriodLimitReached
	}

	if updatesStats.UpdatesInProgress >= effectiveMaxUpdates {
		_ = api.updateInstanceStatus(instance.ID, appID, InstanceStatusOnHold)
		return ErrMaxConcurrentUpdatesLimitReached
	}

	if updatesStats.UpdatesTimedOut >= effectiveMaxUpdates {
		if group.PolicyUpdatesEnabled {
			_ = api.disableUpdates(group.ID)
		}
		_ = api.updateInstanceStatus(instance.ID, appID, InstanceStatusOnHold)
		return ErrMaxTimedOutUpdatesLimitReached
	}

	return nil
}

// grantUpdate grants an update for the provided instance in the context of the
// given application.
func (api *API) grantUpdate(instanceID, appID, version string) error {
	query, _, err := goqu.Update("instance_application").
		Set(goqu.Record{"last_update_granted_ts": nowUTC(),
			"last_update_version": version,
			"update_in_progress":  true}).
		Where(goqu.C("instance_id").Eq(instanceID), goqu.C("application_id").Eq(appID)).
		ToSQL()
	if err != nil {
		return err
	}
	_, err = api.db.Exec(query)

	return err
}

// inOfficeHoursNow checks if the provided timezone is now in office hours.
func inOfficeHoursNow(tz string) bool {
	if tz == "" {
		return false
	}

	location, err := time.LoadLocation(tz)
	if err != nil {
		return false
	}

	now := time.Now().In(location)
	if now.Weekday() == time.Saturday || now.Weekday() == time.Sunday {
		return false
	}
	if now.Hour() < 9 || now.Hour() >= 17 {
		return false
	}

	return true
}
