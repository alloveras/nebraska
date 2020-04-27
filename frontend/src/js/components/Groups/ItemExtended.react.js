import Box from '@material-ui/core/Box';
import Grid from '@material-ui/core/Grid';
import Link from '@material-ui/core/Link';
import Paper from '@material-ui/core/Paper';
import { makeStyles } from '@material-ui/core/styles';
import PropTypes from 'prop-types';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import _ from 'underscore';
import API from '../../api/API';
import { defaultTimeInterval } from '../../constants/helpers';
import { applicationsStore } from '../../stores/Stores';
import ChannelItem from '../Channels/Item.react';
import { CardFeatureLabel, CardHeader, CardLabel } from '../Common/Card';
import ListHeader from '../Common/ListHeader';
import MoreMenu from '../Common/MoreMenu';
import TimeIntervalLinks from '../Common/TimeIntervalLinks';
import InstanceStatusArea from '../Instances/Charts';
import { StatusCountTimeline, VersionCountTimeline } from './Charts';

const useStyles = makeStyles({
  link: {
    fontSize: '1rem'
  },
  instancesChartPaper: {
    height: '100%',
  },
});

function ItemExtended(props) {
  const [application, setApplication] = React.useState(null);
  const [group, setGroup] = React.useState(null);
  const [instancesStats, setInstancesStats] = React.useState({});
  const [versionChartSelectedDuration, setVersionChartSelectedDuration] =
    React.useState(defaultTimeInterval);
  const [statusChartDuration, setStatusChartDuration] =
    React.useState(defaultTimeInterval);
  const classes = useStyles();
  function onChange() {
    const app = applicationsStore.getCachedApplication(props.appID);

    if (!app) {
      applicationsStore.getApplication(props.appID);
      return;
    }

    if (app !== application) {
      setApplication(app);
    }

    const groupFound = app ? _.findWhere(app.groups, {id: props.groupID}) : null;
    if (groupFound !== group) {
      setGroup(groupFound);
    }
  }

  function updateGroup() {
    props.handleUpdateGroup(props.groupId, props.appID);
  }

  React.useEffect(() => {
    applicationsStore.addChangeListener(onChange);
    onChange();

    return function cleanup() {
      applicationsStore.removeChangeListener(onChange);
    };
  },
  [application, group]);

  React.useEffect(() => {
    if (group) {
      API.getGroupInstancesStats(group.application_id, group.id)
        .then(stats => {
          setInstancesStats(stats);
        })
        .catch(err => {
          console.error('Error getting instances stats in Groups/ItemExtended. Group:', group, '\nError:', err);
          setInstancesStats({});
        });
    }
  },
  [group]);

  return (
    <Grid
      container
      spacing={2}
      alignItems="stretch"
    >
      <Grid item xs={5}>
        <Paper>
          <Grid container>
            <Grid item xs={12}>
              <CardHeader
                cardMainLinkLabel={group ? group.name : '…'}
                cardId={group ? group.id : '…'}
                cardDescription={group ? group.description : ''}
              >
                <MoreMenu options={[
                  {
                    'label': 'Edit',
                    'action': updateGroup,
                  }
                ]}
                />
              </CardHeader>
            </Grid>
            {group &&
              <Grid item xs={12}>
                <Box padding="1em">
                  <Grid
                    container
                    direction="column"
                    justify="space-between"
                    spacing={1}
                  >
                    <Grid item>
                      <CardFeatureLabel>Channel:</CardFeatureLabel>
                      {_.isEmpty(group.channel) ?
                        <CardLabel>No channel provided</CardLabel>
                        :
                        <ChannelItem
                          channel={group.channel}
                        />
                      }
                    </Grid>
                    <Grid item>
                      <CardFeatureLabel>Updates:</CardFeatureLabel>&nbsp;
                      <CardLabel>{group.policy_updates_enabled ? 'Enabled' : 'Disabled'}</CardLabel>
                    </Grid>
                    <Grid item>
                      <CardFeatureLabel>Only Office Hours:</CardFeatureLabel>&nbsp;
                      <CardLabel>{group.policy_office_hours ? 'Yes' : 'No'}</CardLabel>
                    </Grid>
                    <Grid item>
                      <CardFeatureLabel>Safe Mode:</CardFeatureLabel>&nbsp;
                      <CardLabel>{group.policy_safe_mode ? 'Yes' : 'No'}</CardLabel>
                    </Grid>
                    <Grid item>
                      <CardFeatureLabel>Updates Policy:</CardFeatureLabel>&nbsp;
                      <CardLabel>
                        Max {group.policy_max_updates_per_period || 0}
                        updates per {group.policy_period_interval || 0}
                      </CardLabel>
                    </Grid>
                    <Grid item>
                      <CardFeatureLabel>Updates Timeout:</CardFeatureLabel>&nbsp;
                      <CardLabel>{group.policy_update_timeout}</CardLabel>
                    </Grid>
                  </Grid>
                </Box>
              </Grid>
            }
          </Grid>
        </Paper>
      </Grid>
      <Grid item xs={7}>
        {group &&
          <Paper className={classes.instancesChartPaper}>
            <ListHeader
              title="Update Progress"
              actions={instancesStats.total > 0 ? [
                <Link
                  className={classes.link}
                  to={{pathname: `/apps/${props.appID}/groups/${props.groupID}/instances`}}
                  component={RouterLink}
                >
                  See instances
                </Link>
              ]
                :
                []
              }
            />
            <Box padding="1em">
              <InstanceStatusArea instanceStats={instancesStats} />
            </Box>

            <Grid container alignItems="flex-end" justify="flex-end">
              <Grid item>
                {updateProgressChartData && updateProgressChartData.total > 0 ?
                  <Box m={2}>
                    {!loadingUpdateProgressChart &&
                    <Link
                      className={classes.link}
                      to={{pathname: `/apps/${props.appID}/groups/${props.groupID}/instances`,
                           search: `period=${updateProgressChartDuration.queryValue}`
                      }}
                      component={RouterLink}
                    >
                      See instances
                    </Link>
                    }
                  </Box>

                  :
                  []
                }
              </Grid>
            </Grid>
          </Paper>
        }
      </Grid>
      { instancesStats.total > 0 &&
        <Grid item xs={12}>
          <Paper>
            <Grid
              container
            >
              <Grid
                item
                md
                xs={12}
                container
                direction="column"
              >
                <Grid container alignItems="center" spacing={10}>
                  <Grid item>
                    <ListHeader title="Version Breakdown" />
                  </Grid>
                  <Grid item>
                    <TimeIntervalLinks intervalChangeHandler={(duration) =>
                      setVersionChartSelectedDuration(duration)}
                    />
                  </Grid>
                </Grid>
                <Box padding="1em">
                  <VersionCountTimeline group={group} duration={versionChartSelectedDuration}/>
                </Box>
              </Grid>
              <Grid
                item
                md
                xs={12}
                container
                direction="column"
              >
                <Grid container alignItems="center" spacing={10}>
                  <Grid item>
                    <ListHeader title="Status Breakdown" />
                  </Grid>
                  <Grid item>
                    <TimeIntervalLinks intervalChangeHandler={(duration) =>
                      setStatusChartDuration(duration)}
                    />
                  </Grid>
                </Grid>
                <Box padding="1em">
                  <StatusCountTimeline group={group} duration={statusChartDuration}/>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      }
    </Grid>
  );
}

ItemExtended.propTypes = {
  appID: PropTypes.string.isRequired,
  groupID: PropTypes.string.isRequired
};

export default ItemExtended;
