import { createAdminShell, attachSharedUi } from "./shared.js";

document.getElementById("app").innerHTML = createAdminShell({
    activeKey: "settings",
    title: "הגדרות אדמין",
    subtitle: "דף עצמאי לחיבורי Firebase, OpenStreetMap והגדרות מערכת.",
    content: `
    <div class="settings-grid">
      <article class="panel">
        <div class="panel-heading">
          <span class="panel-icon blue"><i data-lucide="settings"></i></span>
          <div>
            <h2>OpenStreetMap / Nominatim</h2>
            <p>חיפוש הערים באדמין עובד ישירות מול OpenStreetMap Nominatim, בלי token ובלי endpoint פנימי.</p>
          </div>
        </div>
        <div class="integration-list">
          <div><span class="integration-name">Provider</span><span class="integration-state ready">OpenStreetMap</span></div>
          <div><span class="integration-name">Geocoder</span><span class="integration-state ready">Nominatim</span></div>
          <div><span class="integration-name">Token</span><span class="integration-state ready">לא נדרש</span></div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-heading">
          <span class="panel-icon violet"><i data-lucide="shield-check"></i></span>
          <div>
            <h2>גישה</h2>
            <p>כל דף אדמין מוגן. אם אין session פעיל, יש redirect אוטומטי למסך ההתחברות.</p>
          </div>
        </div>
        <div class="integration-list">
          <div><span class="integration-name">Login Page</span><span class="integration-state ready">פעיל</span></div>
          <div><span class="integration-name">Route Guard</span><span class="integration-state ready">פעיל</span></div>
          <div><span class="integration-name">Username/Password</span><span class="integration-state pending">תלוי ב-Firebase Email/Password</span></div>
        </div>
      </article>
    </div>
  `
});

attachSharedUi({
    activeKey: "settings",
    requireAuth: true,
    onAuthed: () => {
        if (window.lucide) window.lucide.createIcons();
    }
});
