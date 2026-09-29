class GuestPresencePanel extends HTMLElement {
  set hass(value) {
    this._hass = value;
    if (!this._timer && value) {
      this.refresh();
      this._timer = setInterval(() => this.refresh(), 10000);
    }
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
  }

  async refresh() {
    if (this.shadowRoot?.querySelector("#guest-dialog")?.open) return;
    try {
      this._entries = await this._hass.callWS({ type: "guest_presence/list" });
      this._error = "";
    } catch (error) {
      this._error = error.message || String(error);
    }
    this.render();
  }

  async setGuest(entryId, mac, name) {
    try {
      await this._hass.callWS({
        type: "guest_presence/set_guest", entry_id: entryId, mac, name,
      });
      await this.refresh();
    } catch (error) {
      this._error = error.message || String(error);
      this.render();
    }
  }

  render() {
    if (!this._entries) return;
    this._tab ||= "guests";
    const savedSearch = this.shadowRoot?.querySelector("#search")?.value || "";
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-height:100%; background:var(--primary-background-color); color:var(--primary-text-color); font-family:var(--paper-font-body1_-_font-family, sans-serif) }
        main { max-width:1000px; margin:auto; padding:32px 20px 80px }
        header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px }
        h1 { font-size:28px; margin:0 0 4px; letter-spacing:-.04em }
        h2 { font-size:18px; margin:0 0 16px }
        p { margin:0; color:var(--secondary-text-color) }
        .summary { display:flex; gap:12px; flex-wrap:wrap; margin:20px 0 28px }
        nav { display:flex; gap:8px; border-bottom:1px solid var(--divider-color); margin:20px 0 24px }
        nav button { background:none; color:var(--secondary-text-color); border-radius:0; padding:14px 18px; border-bottom:2px solid transparent }
        nav button.active { color:var(--primary-color); border-color:var(--primary-color) }
        .pill { padding:10px 16px; border-radius:999px; background:var(--secondary-background-color); font-weight:600 }
        .online { color:#16815c; background:#dff6eb }
        .error { padding:12px; border-radius:12px; color:#a33131; background:#fdeaea; margin-bottom:16px }
        section { background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:20px; padding:24px; margin:16px 0 }
        .row { display:flex; align-items:center; gap:14px; padding:14px 0; border-top:1px solid var(--divider-color) }
        .identity { flex:1; min-width:0 }
        .name { font-weight:600; overflow-wrap:anywhere }
        .meta { color:var(--secondary-text-color); font-size:12px; margin-top:4px; overflow-wrap:anywhere }
        button { cursor:pointer; border:0; border-radius:11px; padding:10px 14px; font:inherit; font-weight:600; background:var(--primary-color); color:var(--text-primary-color, white) }
        button.outline { background:var(--secondary-background-color); color:var(--primary-text-color) }
        input { border:1px solid var(--divider-color); color:var(--primary-text-color); background:var(--card-background-color); border-radius:10px; padding:12px; font:inherit; box-sizing:border-box; width:100% }
        .toolbar { display:flex; gap:10px; align-items:center; margin-bottom:12px }
        .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:7px; background:#aaa }
        .dot.on { background:#18a674 }
        .empty { padding:18px 0; color:var(--secondary-text-color) }
        .integration { display:flex; justify-content:space-between; gap:16px; align-items:center }
        .integration p { margin-top:6px }
        .badge { border-radius:999px; padding:7px 11px; font-size:12px; font-weight:700; background:var(--secondary-background-color) }
        dialog { border:1px solid var(--divider-color); border-radius:18px; padding:24px; background:var(--card-background-color); color:var(--primary-text-color); width:min(360px, calc(100vw - 60px)); box-shadow:0 20px 60px #0003 }
        dialog::backdrop { background:#0007 }
        dialog h2 { margin-bottom:14px }
        .dialog-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px }
        @media(max-width:560px) { main { padding:20px 14px 64px } section { padding:18px } header { align-items:flex-start } }
      </style>
      <main>
        <header><div><h1>Guest Presence</h1><p>Choose which network devices represent guests.</p></div>
          <button class="outline" id="refresh">Refresh</button></header>
        ${this._error ? `<div class="error" id="error"></div>` : ""}
        <nav aria-label="Guest Presence sections"><button id="tab-guests">Guests</button><button id="tab-integrations">Integrations</button></nav>
        <div id="guests-view"><div class="summary" id="summary"></div>
          <div class="toolbar"><input id="search" type="search" placeholder="Search by name, IP or MAC" aria-label="Search devices"></div>
          <div id="sites"></div></div>
        <div id="integrations-view"></div>
        <dialog id="guest-dialog"><form method="dialog"><h2>Name this guest</h2>
          <input id="guest-name" aria-label="Guest name" maxlength="80" required>
          <div class="dialog-actions"><button class="outline" value="cancel">Cancel</button><button value="save">Save guest</button></div>
        </form></dialog>
      </main>`;
    if (this._error) this.shadowRoot.querySelector("#error").textContent = this._error;
    this.shadowRoot.querySelector("#search").value = savedSearch;
    this.shadowRoot.querySelector("#refresh").onclick = () => this.refresh();
    this.shadowRoot.querySelector("#search").oninput = () => this.renderSites();
    for (const name of ["guests", "integrations"]) {
      this.shadowRoot.querySelector(`#tab-${name}`).onclick = () => {
        this._tab = name;
        this.showTab();
      };
    }
    this.renderSites();
    this.renderIntegrations();
    this.showTab();
  }

  showTab() {
    for (const name of ["guests", "integrations"]) {
      this.shadowRoot.querySelector(`#tab-${name}`).classList.toggle("active", this._tab === name);
      this.shadowRoot.querySelector(`#${name}-view`).hidden = this._tab !== name;
    }
  }

  renderIntegrations() {
    const root = this.shadowRoot.querySelector("#integrations-view");
    root.replaceChildren();
    for (const entry of this._entries) {
      const card = document.createElement("section");
      card.className = "integration";
      const info = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = entry.provider;
      const detail = document.createElement("p");
      detail.textContent = `${entry.title} · ${entry.clients.length} connected devices · ${Object.keys(entry.guests).length} selected guests`;
      info.append(title, detail);
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = entry.available ? "Connected" : "Unavailable";
      card.append(info, badge);
      root.append(card);
    }
    const add = document.createElement("section");
    const title = document.createElement("h2");
    title.textContent = "Add a presence source";
    const hint = document.createElement("p");
    hint.textContent = "Choose Guest Presence in Home Assistant integrations, then select UniFi Cloud and enter your API key.";
    const link = document.createElement("a");
    link.href = "/config/integrations/dashboard";
    link.textContent = "Open Home Assistant integrations →";
    link.style.cssText = "display:inline-block;margin-top:18px;color:var(--primary-color);font-weight:600";
    add.append(title, hint, link);
    root.append(add);
  }

  renderSites() {
    const root = this.shadowRoot.querySelector("#sites");
    const summary = this.shadowRoot.querySelector("#summary");
    root.replaceChildren();
    summary.replaceChildren();
    const total = this._entries.reduce((n, item) => n + item.present.length, 0);
    const pill = document.createElement("span");
    pill.className = `pill ${total ? "online" : ""}`;
    pill.textContent = `${total} guest device${total === 1 ? "" : "s"} at home`;
    summary.append(pill);
    const search = this.shadowRoot.querySelector("#search").value.toLowerCase().trim();
    for (const entry of this._entries) {
      const section = document.createElement("section");
      const heading = document.createElement("h2");
      heading.textContent = entry.title + (entry.available ? "" : " · Connection unavailable");
      section.append(heading);
      const clients = new Map(entry.clients.map(client => [client.mac, client]));
      for (const [mac, name] of Object.entries(entry.guests)) {
        if (!clients.has(mac)) clients.set(mac, { mac, name, ip: "" });
      }
      const sorted = [...clients.values()].sort((a, b) =>
        Number(b.mac in entry.guests) - Number(a.mac in entry.guests) ||
        (entry.guests[a.mac] || a.name).localeCompare(entry.guests[b.mac] || b.name));
      let shown = 0;
      for (const client of sorted) {
        const name = entry.guests[client.mac] || client.name;
        if (!`${name} ${client.name} ${client.ip} ${client.mac}`.toLowerCase().includes(search)) continue;
        shown++;
        const row = document.createElement("div");
        row.className = "row";
        const identity = document.createElement("div");
        identity.className = "identity";
        const title = document.createElement("div");
        title.className = "name";
        const dot = document.createElement("span");
        dot.className = `dot ${entry.present.includes(client.mac) ? "on" : ""}`;
        title.append(dot, document.createTextNode(name));
        const meta = document.createElement("div");
        meta.className = "meta";
        const connected = entry.clients.some(item => item.mac === client.mac);
        meta.textContent = `${entry.present.includes(client.mac) ? "At home" : connected ? "Connected" : "Away"} · ${client.ip ? client.ip + " · " : ""}${client.mac}`;
        identity.append(title, meta);
        const button = document.createElement("button");
        const selected = client.mac in entry.guests;
        button.className = selected ? "outline" : "";
        button.textContent = selected ? "Remove" : "Add guest";
        button.onclick = () => {
          if (selected) return this.setGuest(entry.id, client.mac, null);
          const dialog = this.shadowRoot.querySelector("#guest-dialog");
          const input = dialog.querySelector("#guest-name");
          input.value = client.name === client.mac ? "" : client.name;
          dialog.onclose = () => {
            if (dialog.returnValue === "save" && input.value.trim()) {
              this.setGuest(entry.id, client.mac, input.value.trim());
            }
          };
          dialog.showModal();
        };
        row.append(identity, button);
        section.append(row);
      }
      if (!shown) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = search ? "No matching devices" : "No connected devices yet";
        section.append(empty);
      }
      root.append(section);
    }
  }
}

customElements.define("guest-presence-panel", GuestPresencePanel);
