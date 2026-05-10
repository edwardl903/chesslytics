import { useMemo, useState } from 'react';
import type { EmbedConfig } from '@/types/stats';

interface Props {
  dashboardUrl: string | null;
  embedConfig: EmbedConfig | null;
}

function isPlaceholderUrl(url: string): boolean {
  return url.includes('YOUR_DASHBOARD_ID') || url.includes('placeholder');
}

function buildEmbedUrl(dashboardUrl: string | null, embedConfig: EmbedConfig | null): string | null {
  if (embedConfig?.filters) {
    const dashboardId = embedConfig.dashboard_id || 'dbe35905-fe7a-4971-a502-0e0e5fbe7a3d';
    let url = `https://lookerstudio.google.com/embed/reporting/${dashboardId}`;
    if (embedConfig.filters.username_year) {
      url += `?user_filter=${encodeURIComponent(embedConfig.filters.username_year)}`;
    }
    return url;
  }
  return dashboardUrl;
}

export default function DashboardEmbed({ dashboardUrl, embedConfig }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const embedUrl = useMemo(
    () => buildEmbedUrl(dashboardUrl, embedConfig),
    [dashboardUrl, embedConfig],
  );

  if (!embedUrl || isPlaceholderUrl(embedUrl)) {
    return <ComingSoonDashboard />;
  }

  if (!loaded) {
    return (
      <section className="dashboard-embed-section" aria-labelledby="dash-load-heading">
        <h2 id="dash-load-heading" className="dashboard-embed-heading">
          Personalized dashboard
        </h2>
        <div className="dashboard-lazy-placeholder">
          <p className="dashboard-lazy-copy">
            Loads an embedded Looker Studio report (can be heavy on mobile data). Tap when you’re
            ready.
          </p>
          <button type="button" className="dashboard-load-btn" onClick={() => setLoaded(true)}>
            Load dashboard
          </button>
        </div>
      </section>
    );
  }

  const iframeSrc = `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}_t=${refreshKey}`;

  return (
    <section className="dashboard-embed-section" aria-labelledby="dash-live-heading">
      <h2 id="dash-live-heading" className="dashboard-embed-heading">
        Interactive dashboard
      </h2>
      <p className="dashboard-embed-sub">
        BigQuery-backed charts. Use fullscreen or open in a new tab if the embed feels small.
      </p>

      <div id="lookerEmbedContainer" className="dashboard-iframe-shell">
        <iframe
          key={refreshKey}
          title="Chess analytics dashboard"
          src={iframeSrc}
          className="dashboard-iframe"
          allowFullScreen
        />
      </div>

      <div className="dashboard-toolbar">
        <button
          type="button"
          className="dashboard-tool-btn dashboard-tool-primary"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Refresh
        </button>
        <button
          type="button"
          className="dashboard-tool-btn"
          onClick={() => document.getElementById('lookerEmbedContainer')?.requestFullscreen?.()}
        >
          Fullscreen
        </button>
        <button
          type="button"
          className="dashboard-tool-btn"
          onClick={() => window.open(embedUrl, '_blank', 'noopener,noreferrer')}
        >
          Open in new tab
        </button>
      </div>
    </section>
  );
}

function ComingSoonDashboard() {
  return (
    <section
      className="dashboard-embed-section dashboard-coming-soon"
      aria-labelledby="dash-soon-heading"
    >
      <h2 id="dash-soon-heading" className="dashboard-embed-heading">
        Interactive dashboard
      </h2>
      <p className="dashboard-embed-sub">
        Full Looker Studio wiring is optional until your mart tables are ready. Games still upload to
        BigQuery when you generate stats.
      </p>
    </section>
  );
}
