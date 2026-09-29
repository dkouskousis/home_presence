class HomePresencePanel extends HTMLElement {
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

  async refresh(force = false) {
    const active = this.shadowRoot?.activeElement;
    if (!force && (this.shadowRoot?.querySelector("dialog[open]") ||
        ["INPUT", "SELECT"].includes(active?.tagName))) return;
    try {
      this._entries = await this._hass.callWS({ type: "home_presence/list" });
      this._error = "";
    } catch (error) {
      this._error = error.message || String(error);
    }
    this.render();
  }

  async update(type, data) {
    try {
      await this._hass.callWS({ type: `home_presence/${type}`, ...data });
      await this.refresh(true);
    } catch (error) {
      this._error = error.message || String(error);
      this.render();
    }
  }

  element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  button(label, onClick, secondary = false) {
    const button = this.element("button", label, secondary ? "outline" : "");
    button.type = "button";
    button.onclick = onClick;
    return button;
  }

  render() {
    if (!this._entries) return;
    this._tab ||= "devices";
    const search = this.shadowRoot?.querySelector("#search")?.value || "";
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-height:100%; background:var(--primary-background-color); color:var(--primary-text-color); font-family:Arial,sans-serif }
        main { max-width:1060px; margin:auto; padding:32px 22px 80px }
        header,.between { display:flex; justify-content:space-between; align-items:center; gap:16px }
        h1 { font-size:30px; letter-spacing:-.04em; margin:0 0 6px }
        h2 { font-size:18px; margin:0 0 12px }
        p { margin:0; color:var(--secondary-text-color); line-height:1.5 }
        nav { display:flex; gap:6px; overflow:auto; border-bottom:1px solid var(--divider-color); margin:26px 0 }
        nav button { background:transparent; color:var(--secondary-text-color); border-radius:0; border-bottom:2px solid transparent; white-space:nowrap }
        nav button.active { color:var(--primary-color); border-color:var(--primary-color) }
        section { background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:18px; padding:22px; margin:16px 0 }
        .row { display:flex; align-items:center; gap:12px; padding:14px 0; border-top:1px solid var(--divider-color) }
        .identity { flex:1; min-width:0 }
        .name { font-weight:600; overflow-wrap:anywhere }
        .meta { font-size:12px; color:var(--secondary-text-color); margin-top:5px; overflow-wrap:anywhere }
        .dot { display:inline-block; width:9px; height:9px; margin-right:9px; border-radius:50%; background:#a7a7a7 }
        .dot.on { background:#19a675 }
        .pill { display:inline-block; padding:8px 13px; border-radius:999px; background:var(--secondary-background-color); font-size:13px; font-weight:600 }
        .summary { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px }
        .toolbar { display:flex; gap:10px; margin:16px 0 }
        button { cursor:pointer; border:0; border-radius:10px; padding:10px 15px; font:inherit; font-weight:600; background:var(--primary-color); color:var(--text-primary-color,white) }
        button.outline { background:var(--secondary-background-color); color:var(--primary-text-color) }
        input { width:100%; box-sizing:border-box; padding:11px; border:1px solid var(--divider-color); border-radius:10px; background:var(--card-background-color); color:var(--primary-text-color); font:inherit }
        input[type=checkbox] { width:auto; margin-right:9px }
        label { display:block; margin:15px 0 6px; font-weight:600 }
        .check { font-weight:400; padding:6px 0 }
        .check-list { display:flex; flex-wrap:wrap; column-gap:20px }
        .actions { display:flex; gap:8px; justify-content:flex-end; margin-top:20px }
        .error { padding:13px; border-radius:10px; background:#fdeaea; color:#9d3030; margin:15px 0 }
        .empty { color:var(--secondary-text-color); padding:18px 0 }
        dialog { border:1px solid var(--divider-color); border-radius:18px; background:var(--card-background-color); color:var(--primary-text-color); width:min(420px,calc(100vw - 48px)); padding:24px; box-shadow:0 20px 70px #0004 }
        dialog::backdrop { background:#0008 }
        a { color:var(--primary-color) }
        @media(max-width:600px) { main { padding:18px 14px 60px } section { padding:17px } header { align-items:flex-start } }
      </style>
      <main>
        <header><div><h1>Home Presence</h1><p>Manage who is home, by device and group.</p></div><button class="outline" id="refresh">Refresh</button></header>
        <div id="error"></div>
        <nav aria-label="Home Presence sections"></nav>
        <div id="view"></div>
        <dialog id="editor"></dialog>
      </main>`;
    const error = this.shadowRoot.querySelector("#error");
    if (this._error) error.append(this.element("div", this._error, "error"));
    this.shadowRoot.querySelector("#refresh").onclick = () => this.refresh();
    const nav = this.shadowRoot.querySelector("nav");
    for (const tab of ["Devices", "Groups", "Integrations", "Settings"]) {
      const button = this.button(tab, () => {
        this._tab = tab.toLowerCase();
        this.render();
      });
      if (this._tab === tab.toLowerCase()) button.classList.add("active");
      nav.append(button);
    }
    this.shadowRoot.querySelector("#view").replaceChildren();
    if (this._tab === "devices") this.renderDevices(search);
    if (this._tab === "groups") this.renderGroups();
    if (this._tab === "integrations") this.renderIntegrations();
    if (this._tab === "settings") this.renderSettings();
  }

  renderDevices(search) {
    const root = this.shadowRoot.querySelector("#view");
    const total = this._entries.reduce((sum, entry) => sum + entry.present.length, 0);
    const summary = this.element("div", undefined, "summary");
    summary.append(this.element("span", `${total} selected device${total === 1 ? "" : "s"} at home`, "pill"));
    root.append(summary);
    const input = this.element("input");
    input.id = "search";
    input.type = "search";
    input.placeholder = "Search name, IP or MAC";
    input.value = search;
    input.oninput = () => this.renderDeviceLists();
    root.append(input);
    const lists = this.element("div");
    lists.id = "device-lists";
    root.append(lists);
    this.renderDeviceLists();
  }

  renderDeviceLists() {
    const root = this.shadowRoot.querySelector("#device-lists");
    root.replaceChildren();
    const search = this.shadowRoot.querySelector("#search").value.toLowerCase().trim();
    for (const entry of this._entries) {
      const section = this.element("section");
      section.append(this.element("h2", entry.title));
      const connected = new Map(entry.clients.map(client => [client.mac, client]));
      for (const [id, device] of Object.entries(entry.devices)) {
        if (!connected.has(id)) connected.set(id, { mac:id, name:device.name, ip:"" });
      }
      const items = [...connected.values()].sort((a,b) =>
        Number(b.mac in entry.devices) - Number(a.mac in entry.devices) ||
        (entry.devices[a.mac]?.name || a.name).localeCompare(entry.devices[b.mac]?.name || b.name));
      let shown = 0;
      for (const client of items) {
        const device = entry.devices[client.mac];
        const name = device?.name || client.name;
        if (!`${name} ${client.name} ${client.ip} ${client.mac}`.toLowerCase().includes(search)) continue;
        shown++;
        const row = this.element("div", undefined, "row");
        const identity = this.element("div", undefined, "identity");
        const heading = this.element("div", undefined, "name");
        heading.append(this.element("span", undefined, `dot ${entry.present.includes(client.mac) ? "on" : ""}`),
          document.createTextNode(name));
        const status = entry.present.includes(client.mac) ? "Home" :
          entry.clients.some(item => item.mac === client.mac) ? "Connected" : "Away";
        const groupNames = (device?.groups || []).map(id => entry.groups[id]?.name).filter(Boolean);
        identity.append(heading, this.element("div",
          `${status} · ${client.ip ? client.ip + " · " : ""}${client.mac}${groupNames.length ? " · " + groupNames.join(", ") : ""}`, "meta"));
        if (device && entry.device_entities[client.mac]) {
          identity.append(this.element("div", entry.device_entities[client.mac], "meta"));
        }
        row.append(identity, this.button(device ? "Edit" : "Add device",
          () => this.editDevice(entry, client), !!device));
        section.append(row);
      }
      if (!shown) section.append(this.element("div", search ? "No matching devices" : "No connected devices", "empty"));
      root.append(section);
    }
  }

  editDevice(entry, client) {
    const device = entry.devices[client.mac];
    const dialog = this.shadowRoot.querySelector("#editor");
    dialog.replaceChildren();
    const form = this.element("form");
    const title = this.element("h2", device ? "Edit device" : "Add device");
    const label = this.element("label", "Device name");
    const input = this.element("input");
    input.required = true;
    input.maxLength = 80;
    input.value = device?.name || (client.name === client.mac ? "" : client.name);
    label.append(input);
    form.append(title, label, this.element("p", client.mac));
    const groupLabel = this.element("label", "Groups");
    const checks = this.element("div", undefined, "check-list");
    for (const [id, group] of Object.entries(entry.groups)) {
      const wrap = this.element("label", undefined, "check");
      const check = this.element("input");
      check.type = "checkbox";
      check.value = id;
      check.checked = (device?.groups || []).includes(id);
      wrap.append(check, document.createTextNode(group.name));
      checks.append(wrap);
    }
    groupLabel.append(checks);
    form.append(groupLabel);
    const actions = this.element("div", undefined, "actions");
    if (device) actions.append(this.button("Remove", async () => {
      dialog.close();
      await this.update("set_device", {entry_id:entry.id, device_id:client.mac, name:null});
    }, true));
    actions.append(this.button("Cancel", () => dialog.close(), true));
    const save = this.element("button", "Save");
    save.type = "submit";
    actions.append(save);
    form.append(actions);
    form.onsubmit = async event => {
      event.preventDefault();
      dialog.close();
      await this.update("set_device", {
        entry_id:entry.id, device_id:client.mac, name:input.value.trim(),
        groups:[...checks.querySelectorAll("input:checked")].map(item => item.value),
      });
    };
    dialog.append(form);
    dialog.showModal();
  }

  renderGroups() {
    const root = this.shadowRoot.querySelector("#view");
    for (const entry of this._entries) {
      const section = this.element("section");
      const heading = this.element("div", undefined, "between");
      heading.append(this.element("h2", `Groups · ${entry.title}`),
        this.button("New group", () => this.editGroup(entry, "")));
      section.append(heading);
      for (const [id, group] of Object.entries(entry.groups)) {
        const members = Object.entries(entry.devices).filter(([,device]) => device.groups.includes(id));
        const present = members.filter(([deviceId]) => entry.present.includes(deviceId));
        const row = this.element("div", undefined, "row");
        const identity = this.element("div", undefined, "identity");
        const title = this.element("div", undefined, "name");
        title.append(this.element("span", undefined, `dot ${present.length ? "on" : ""}`),
          document.createTextNode(group.name));
        identity.append(title, this.element("div",
          `${present.length} at home · ${members.length} devices`, "meta"));
        if (entry.group_entities[id]) identity.append(
          this.element("div", entry.group_entities[id], "meta"));
        row.append(identity, this.button("Edit", () => this.editGroup(entry, id), true));
        section.append(row);
      }
      if (!Object.keys(entry.groups).length) section.append(
        this.element("div", "Create a group such as Family, Friends or Guests.", "empty"));
      root.append(section);
    }
  }

  editGroup(entry, groupId) {
    const dialog = this.shadowRoot.querySelector("#editor");
    dialog.replaceChildren();
    const form = this.element("form");
    const label = this.element("label", "Group name");
    const input = this.element("input");
    input.required = true;
    input.maxLength = 80;
    input.value = entry.groups[groupId]?.name || "";
    label.append(input);
    form.append(this.element("h2", groupId ? "Edit group" : "New group"), label);
    const actions = this.element("div", undefined, "actions");
    if (groupId) actions.append(this.button("Remove", async () => {
      dialog.close();
      await this.update("set_group", {entry_id:entry.id, group_id:groupId, name:null});
    }, true));
    actions.append(this.button("Cancel", () => dialog.close(), true));
    const save = this.element("button", "Save");
    save.type = "submit";
    actions.append(save);
    form.append(actions);
    form.onsubmit = async event => {
      event.preventDefault();
      dialog.close();
      await this.update("set_group", {
        entry_id:entry.id, group_id:groupId, name:input.value.trim(),
      });
    };
    dialog.append(form);
    dialog.showModal();
  }

  renderIntegrations() {
    const root = this.shadowRoot.querySelector("#view");
    for (const entry of this._entries) {
      const card = this.element("section");
      card.append(this.element("h2", entry.provider),
        this.element("p", `${entry.title} · ${entry.available ? "Connected" : "Unavailable"} · ${entry.clients.length} clients`));
      root.append(card);
    }
    const add = this.element("section");
    add.append(this.element("h2", "Add a presence source"),
      this.element("p", "In Home Assistant integrations, add Home Presence and choose UniFi Cloud."));
    const link = this.element("a", "Open integrations →");
    link.href = "/config/integrations/dashboard";
    add.append(link);
    root.append(add);
  }

  renderSettings() {
    const root = this.shadowRoot.querySelector("#view");
    for (const entry of this._entries) {
      const section = this.element("section");
      section.append(this.element("h2", entry.title));
      const form = this.element("form");
      const pollLabel = this.element("label", "Refresh interval (seconds)");
      const poll = this.element("input");
      poll.type = "number"; poll.min = 30; poll.max = 600;
      poll.value = entry.settings.poll_seconds;
      pollLabel.append(poll);
      const awayLabel = this.element("label", "Mark away after disconnect (seconds)");
      const away = this.element("input");
      away.type = "number"; away.min = 0; away.max = 3600;
      away.value = entry.settings.away_seconds;
      awayLabel.append(away);
      form.append(pollLabel, awayLabel, this.element("p",
        "A longer away delay helps with brief Wi-Fi disconnects. Cloud errors make entities unavailable."));
      const save = this.element("button", "Save settings");
      save.type = "submit";
      form.append(this.element("div", undefined, "actions"));
      form.lastChild.append(save);
      form.onsubmit = async event => {
        event.preventDefault();
        await this.update("set_settings", {
          entry_id:entry.id, poll_seconds:Number(poll.value), away_seconds:Number(away.value),
        });
      };
      section.append(form);
      root.append(section);
    }
  }
}

customElements.define("home-presence-panel", HomePresencePanel);
