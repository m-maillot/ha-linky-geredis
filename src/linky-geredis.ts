import { Session } from 'linky-geredis';
import dayjs, { Dayjs } from 'dayjs';
import { debug, info, warn } from './log.js';
import {
  formatAsStatistics,
  formatDailyData,
  formatLoadCurve,
  type LinkyDataPoint,
  type StatisticDataPoint,
} from './format.js';

export class LinkyGeredisClient {
  private session: Session;
  public user: string;
  public password: string;

  constructor(user: string, password: string) {
    this.user = user;
    this.password = password;
    this.session = new Session(user, password);
  }

  public async getEnergyData(firstDay: null | Dayjs): Promise<StatisticDataPoint[]> {
    const history: LinkyDataPoint[][] = [];
    let offset = 0;
    let limitReached = false;
    const keyword = 'consumption';

    let interval = 90;

    let fromDate = dayjs().subtract(offset + interval, 'days');
    let from = fromDate.format('YYYY-MM-DD');

    if (isBefore(fromDate, firstDay)) {
      from = firstDay.format('YYYY-MM-DD');
      limitReached = true;
    }

    let to = dayjs().subtract(offset, 'days').format('YYYY-MM-DD');

    try {
      const loadCurve = await this.session.getLoadCurve(from, to);
      history.unshift(formatLoadCurve(loadCurve.interval_reading));
      debug(`Successfully retrieved ${keyword} load curve from ${from} to ${to}`);
      offset += interval;
    } catch (e) {
      debug(`Cannot fetch ${keyword} load curve from ${from} to ${to}, here is the error:`);
      warn(e);
    }

    const maxLoops = 2;
    for (let loop = 0; loop < 2; loop++) {
      if (limitReached) {
        break;
      }
      interval = (365 - 7) / maxLoops;
      fromDate = dayjs().subtract(offset + interval, 'days');
      from = fromDate.format('YYYY-MM-DD');
      to = dayjs().subtract(offset, 'days').format('YYYY-MM-DD');

      if (isBefore(fromDate, firstDay)) {
        from = firstDay.format('YYYY-MM-DD');
        limitReached = true;
      }

      try {
        const dailyData = await this.session.getDailyConsumption(from, to);
        history.unshift(formatDailyData(dailyData.interval_reading));
        debug(`Successfully retrieved daily ${keyword} data from ${from} to ${to}`);
        offset += interval;
      } catch (e) {
        if (
          !firstDay &&
          [
            "The requested period cannot be anterior to the meter's last activation date",
            'The start date must be greater than the history deadline.',
            'no measure found for this usage point',
          ].includes(e.response?.error?.['error_description'])
        ) {
          // Not really an error, just a limit reached
          info(`All available ${keyword} data has been imported`);
          break;
        }
        debug(`Cannot fetch daily ${keyword} data from ${from} to ${to}, here is the error:`);
        warn(e);
        break;
      }
    }

    const dataPoints: LinkyDataPoint[] = history.flat();

    if (dataPoints.length === 0) {
      warn('Data import returned nothing !');
    } else {
      const intervalFrom = dayjs(dataPoints[0].date).format('DD/MM/YYYY');
      const intervalTo = dayjs(dataPoints[dataPoints.length - 1].date).format('DD/MM/YYYY');
      info(`Data import returned ${dataPoints.length} data points from ${intervalFrom} to ${intervalTo}`);
    }

    return formatAsStatistics(dataPoints);
  }
}

function isBefore(a: Dayjs, b: Dayjs): boolean {
  return b && (a.isBefore(b, 'day') || a.isSame(b, 'day'));
}
