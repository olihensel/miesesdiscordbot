import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import moment from 'moment';
import { createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as ormConfig from '../ormconfig.json';

export async function renderCalendar(activeDays: { day: string; count: number }[]) {
  const columnWidth = 60;
  const rowHeight = 15;
  const canvas = createCanvas(columnWidth * 12, rowHeight * 31);
  const ctx = canvas.getContext('2d');
  // fill the canvas in light gray
  const maxMessagesPerDay = Math.max(...activeDays.map((d) => d.count));
  const date = moment('2022-12-31');
  for (let month = 0; month <= 12; month++) {
    const daysInMonth = date.month(month).daysInMonth();
    for (let day = 1; day <= daysInMonth; day++) {
      ctx.fillStyle = '#535353';
      ctx.fillRect(month * columnWidth, (day - 1) * rowHeight, columnWidth, rowHeight);
      const currentDayString = date.month(month).date(day).format('YYYY-MM-DD');
      const currentDay = activeDays.find((d) => d.day === currentDayString);
      const isActive = (currentDay?.count ?? 0) > 0;
      // calculate alpha channel linearly based on message count. 0.2 if no messages, 1 if (close to) max messages

      let alpha = isActive ? 0.1 + ((currentDay?.count ?? 0) / maxMessagesPerDay) * (1 - 0.1) : 0.1;
      if (alpha > 1) alpha = 1;
      // alpha = 1 - alpha;

      ctx.fillStyle = '#333333';
      ctx.fillRect(month * columnWidth + 1, (day - 1) * rowHeight + 1, columnWidth - 2, rowHeight - 2);

      ctx.fillStyle = isActive ? '#00BBC6' + Math.round(alpha * 255).toString(16) : '#333333';
      ctx.fillRect(month * columnWidth + 1, (day - 1) * rowHeight + 1, columnWidth - 2, rowHeight - 2);
    }
  }
  const buffer = canvas.toBuffer('image/png');
  // convert buffer to datauri
  const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;
  return { buffer, dataUri };
}

if (require.main === module) {
  (async () => {
    const connection = await createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });

    const activeDays = (
      (await connection.query(
        `SELECT t.date, count(*) from (SELECT DATE(timestamp) as date, count(from_id) as count, from_id
    from discord_message 
    WHERE timestamp between $1 and $2
    GROUP BY date, from_id
    ORDER BY date desc) as t
    GROUP BY t.date
    ORDER BY t.date desc
    `,
        ['2022-01-01', '2023-01-01'],
      )) as { date: string; count: number }[]
    ).map((entry) => ({ day: moment(entry.date).format('YYYY-MM-DD'), count: entry.count }));
    const maxMessagesPerDay = Math.max(...activeDays.map((d) => d.count));
    const minMessagesPerDay = Math.min(...activeDays.map((d) => d.count));
    console.log(
      activeDays,
      maxMessagesPerDay,
      activeDays.find((d) => Number(d.count) === maxMessagesPerDay)?.day,
      minMessagesPerDay,
      activeDays.find((d) => Number(d.count) === minMessagesPerDay)?.day,
    );

    const calendar = await renderCalendar(activeDays);
    writeFileSync('calendar.png', calendar.buffer);
    await connection.close();
  })().catch(console.error);
}
