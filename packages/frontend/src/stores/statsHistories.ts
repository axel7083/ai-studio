import type { Readable } from 'svelte/store';
import { Messages } from '@shared/Messages';
import { studioClient } from '/@/utils/client';
import { RPCReadable } from '/@/stores/rpcReadable';
import type { StatsHistory } from '../../../backend/src/managers/monitoringManager';

export const statsHistories: Readable<StatsHistory[]> = RPCReadable<StatsHistory[]>(
  [],
  [Messages.MSG_MONITORING_UPDATE],
  studioClient.getStatsHistories,
);
