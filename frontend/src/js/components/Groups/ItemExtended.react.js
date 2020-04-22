import Box from '@material-ui/core/Box';
import Grid from '@material-ui/core/Grid';
import Link from '@material-ui/core/Link';
import Paper from '@material-ui/core/Paper';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import PropTypes from 'prop-types';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import _ from 'underscore';
import API from '../../api/API';
import { applicationsStore } from '../../stores/Stores';
import ChannelItem from '../Channels/Item.react';
import { CardFeatureLabel, CardHeader, CardLabel } from '../Common/Card';
import ListHeader from '../Common/ListHeader';
import MoreMenu from '../Common/MoreMenu';
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
      <Grid item xs={12} md={5} lg={5}>
        <Paper>
          <Grid container>
            <Grid item xs={10} sm={12}>
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
      <Grid item xs={12} md={7}>
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
                <ListHeader title="Version Breakdown" />
                <Box padding="1em">
                  <VersionCountTimeline group={group} />
                </Box>
              </Grid>
              <Grid
                item
                md
                xs={12}
                container
                direction="column"
              >
                <ListHeader title="Status Breakdown" />
                <Box padding="1em">
                  <StatusCountTimeline group={group} />
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
