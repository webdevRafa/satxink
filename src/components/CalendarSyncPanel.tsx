import { Copy } from "lucide-react";

const CalendarSyncPanel: React.FC<{ feedUrl: string }> = ({ feedUrl }) => {
  const copyLink = () => navigator.clipboard.writeText(feedUrl);

  return (
    <div className="bg-[var(--color-bg-card)] rounded-lg p-6 max-w-lg mx-auto mt-10 text-neutral-200 flex justify-center md:translate-x-[-50%]">
      <div className="w-full">
        <h2 className="text-xl font-bold mb-4">Sync Your Bookings</h2>
        <p className="mb-4 text-sm">
          Add your SATX Ink bookings to your phone or computer calendar. Updates
          automatically whenever your bookings change.
        </p>
        <div className="flex items-center gap-2 bg-[var(--color-bg-base)] p-3 rounded">
          <span className="truncate text-sm">{feedUrl}</span>
          <button
            onClick={copyLink}
            className="p-2 hover:bg-neutral-700 rounded"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-3 mt-4">
          <a
            href={feedUrl.replace(/^https?:/, "webcal:")}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
          >
            Add to Apple Calendar
          </a>
          <a
            href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
          >
            Add to Google Calendar
          </a>
        </div>
        <p className="mt-4 text-xs text-neutral-400">
          This feed is private — only share with those you trust.
        </p>
      </div>
    </div>
  );
};

export default CalendarSyncPanel;
