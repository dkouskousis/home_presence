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
        input,select { width:100%; box-sizing:border-box; padding:11px; border:1px solid var(--divider-color); border-radius:10px; background:var(--card-background-color); color:var(--primary-text-color); font:inherit }
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
        <header><div><h1>Home Presence</h1><p id="subtitle">Manage who is home, by device and group.</p></div><button class="outline" id="refresh">Refresh</button></header>
        <div id="error"></div>
        <nav aria-label="Home Presence sections"></nav>
        <div id="view"></div>
        <dialog id="editor"></dialog>
      </main>`;
    const error = this.shadowRoot.querySelector("#error");
    const version = this._entries[0]?.version;
    if (version) this.shadowRoot.querySelector("#subtitle").textContent =
      `Version ${version} · Manage who is home, by device and group.`;
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
      const connected = new Map(entry.clients.map(client => [client.id, client]));
      for (const [id, device] of Object.entries(entry.devices)) {
        if (!connected.has(id)) connected.set(id, { id, mac:id.split("|")[1], name:device.name, ip:"", source:id.split("|")[0] });
      }
      const items = [...connected.values()].sort((a,b) =>
        Number(b.id in entry.devices) - Number(a.id in entry.devices) ||
        (entry.devices[a.id]?.name || a.name).localeCompare(entry.devices[b.id]?.name || b.name));
      let shown = 0;
      for (const client of items) {
        const device = entry.devices[client.id];
        const name = device?.name || client.name;
        if (!`${name} ${client.name} ${client.ip} ${client.mac}`.toLowerCase().includes(search)) continue;
        shown++;
        const row = this.element("div", undefined, "row");
        const identity = this.element("div", undefined, "identity");
        const heading = this.element("div", undefined, "name");
        heading.append(this.element("span", undefined, `dot ${entry.present.includes(client.id) ? "on" : ""}`),
          document.createTextNode(name));
        const status = entry.unavailable.includes(client.id) ? "Unavailable" :
          entry.present.includes(client.id) ? "Home" :
          entry.clients.some(item => item.id === client.id) ? "Connected" : "Away";
        const groupNames = (device?.groups || []).map(id => entry.groups[id]?.name).filter(Boolean);
        identity.append(heading, this.element("div",
          `${status} · ${client.source} · ${client.ip ? client.ip + " · " : ""}${client.mac}${groupNames.length ? " · " + groupNames.join(", ") : ""}`, "meta"));
        if (device && entry.device_entities[client.id]) {
          identity.append(this.element("div", entry.device_entities[client.id], "meta"));
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
    const device = entry.devices[client.id];
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
      await this.update("set_device", {entry_id:entry.id, device_id:client.id, name:null});
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
        entry_id:entry.id, device_id:client.id, name:input.value.trim(),
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
    const entry = this._entries[0];
    if (!entry) return;
    const names = {unifi_cloud:"UniFi Cloud", omada:"TP-Link Omada"};
    for (const provider of ["unifi_cloud", "omada"]) {
      const source = entry.sources.find(item => item.id === provider);
      const card = this.element("section");
      const heading = this.element("div", undefined, "between");
      heading.append(this.element("h2", names[provider]),
        this.button(source ? "Configure" : "Add integration", () => this.editIntegration(entry, provider), !!source));
      card.append(heading);
      if (source) {
        card.append(this.element("p", `${source.label} · ${source.available ? "Connected" : "Unavailable"} · Site ${source.site_id}`));
        if (source.error) card.append(this.element("div", source.error, "meta"));
      } else {
        card.append(this.element("p", provider === "unifi_cloud" ?
          "Connect with a UniFi Site Manager API key." :
          "Connect to an Omada Controller Open API app using client credentials."));
      }
      root.append(card);
    }
  }

  editIntegration(entry, provider) {
    const dialog = this.shadowRoot.querySelector("#editor");
    dialog.replaceChildren();
    const form = this.element("form");
    const title = this.element("h2", provider === "unifi_cloud" ? "UniFi Cloud" : "TP-Link Omada");
    form.append(title);
    const fields = {};
    const specs = provider === "unifi_cloud" ?
      [["api_key", "Site Manager API key", "password"]] :
      [["address", "Interface access address (https://host:port)", "url"],
       ["omadac_id", "Omada ID", "text"], ["client_id", "Client ID", "text"],
       ["client_secret", "Client secret", "password"]];
    for (const [key, labelText, type] of specs) {
      const label = this.element("label", labelText);
      const input = this.element("input");
      input.type = type; input.required = true; input.autocomplete = "off";
      label.append(input); form.append(label); fields[key] = input;
    }
    if (entry.sources.some(item => item.id === provider)) {
      form.append(this.element("p", "Enter credentials again to change this connection."));
    }
    const discovery = this.element("div");
    form.append(discovery);
    const error = this.element("div");
    form.append(error);
    const actions = this.element("div", undefined, "actions");
    const discover = this.button("Find sites", async () => {
      error.replaceChildren();
      discovery.replaceChildren();
      const credentials = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
      if (!form.reportValidity()) return;
      discover.disabled = true;
      try {
        let consoleId;
        if (provider === "unifi_cloud") {
          const hosts = await this._hass.callWS({type:"home_presence/discover", entry_id:entry.id,
            provider, credentials});
          if (!hosts.length) throw Error("No UniFi consoles found");
          const label = this.element("label", "Console");
          const select = this.element("select");
          this.appendOptions(select, hosts);
          label.append(select); discovery.append(label);
          const sitesLabel = this.element("label", "Site");
          const siteSelect = this.element("select");
          sitesLabel.append(siteSelect); discovery.append(sitesLabel);
          const loadSites = async () => {
            siteSelect.replaceChildren();
            const sites = await this._hass.callWS({type:"home_presence/discover", entry_id:entry.id,
              provider, credentials, console_id:select.value});
            if (!sites.length) throw Error("No Network sites found");
            this.appendOptions(siteSelect, sites);
          };
          select.onchange = () => loadSites().catch(err => error.replaceChildren(
            this.element("div", err.message || String(err), "error")));
          await loadSites();
          consoleId = select;
          fields.site_id = siteSelect;
        } else {
          const sites = await this._hass.callWS({type:"home_presence/discover", entry_id:entry.id,
            provider, credentials});
          if (!sites.length) throw Error("No Omada sites found");
          const label = this.element("label", "Site");
          const select = this.element("select");
          this.appendOptions(select, sites);
          label.append(select); discovery.append(label);
          fields.site_id = select;
        }
        fields.console_id = consoleId;
        const label = this.element("label", "Connection name");
        const input = this.element("input"); input.required = true; input.maxLength = 80;
        input.value = provider === "unifi_cloud" ? "UniFi Cloud" : "TP-Link Omada";
        label.append(input); discovery.append(label); fields.label = input;
        const save = this.element("button", "Save integration"); save.type = "submit";
        discovery.append(this.element("div", undefined, "actions"));
        discovery.lastChild.append(save);
      } catch (err) {
        error.replaceChildren(this.element("div", err.message || String(err), "error"));
      } finally {
        discover.disabled = false;
      }
    });
    if (entry.sources.some(item => item.id === provider)) actions.append(this.button("Remove", async () => {
      if (!window.confirm("Remove this integration and its selected devices?")) return;
      try {
        await this._hass.callWS({type:"home_presence/set_source", entry_id:entry.id, provider});
        dialog.close(); await this.refresh(true);
      } catch (err) { error.replaceChildren(this.element("div", err.message || String(err), "error")); }
    }, true));
    actions.append(this.button("Cancel", () => dialog.close(), true), discover);
    form.append(actions);
    form.onsubmit = async event => {
      event.preventDefault();
      const source = Object.fromEntries(Object.entries(fields).filter(([,input]) => input)
        .map(([key,input]) => [key,input.value.trim()]));
      try {
        await this._hass.callWS({type:"home_presence/set_source", entry_id:entry.id, provider, source});
        dialog.close(); await this.refresh(true);
      } catch (err) { error.replaceChildren(this.element("div", err.message || String(err), "error")); }
    };
    dialog.append(form);
    dialog.showModal();
  }

  appendOptions(select, options) {
    for (const item of options) {
      const option = this.element("option", item.name);
      option.value = item.id;
      select.append(option);
    }
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

      const backup = this.element("section");
      backup.append(this.element("h2", "Backup & restore"),
        this.element("p", "Download all integrations, selected devices, groups and settings. The file includes API keys and secrets; keep it private."));
      const download = this.button("Download backup", async () => {
        try {
          const data = await this._hass.callWS({type:"home_presence/backup", entry_id:entry.id});
          const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
          const url = URL.createObjectURL(blob);
          const link = this.element("a");
          link.href = url;
          link.download = `home-presence-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          this._error = error.message || String(error);
          this.render();
        }
      });
      const file = this.element("input");
      file.type = "file";
      file.accept = ".json,application/json";
      file.setAttribute("aria-label", "Choose a Home Presence backup");
      const restore = this.button("Restore backup", async () => {
        if (!file.files?.length) {
          this._error = "Choose a backup file first.";
          this.render();
          return;
        }
        try {
          if (file.files[0].size > 5 * 1024 * 1024) throw Error("Backup exceeds 5 MB.");
          const data = JSON.parse(await file.files[0].text());
          if (!data || data.format !== "home_presence" || data.version !== 1) {
            throw Error("This is not a supported Home Presence backup.");
          }
          const message = `Restore ${Object.keys(data.devices || {}).length} devices, ` +
            `${Object.keys(data.groups || {}).length} groups and ` +
            `${Object.keys(data.sources || {}).length} integrations? ` +
            "This replaces the current Home Presence setup.";
          if (!window.confirm(message)) return;
          await this._hass.callWS({type:"home_presence/restore", entry_id:entry.id, backup:data});
          await this.refresh(true);
        } catch (error) {
          this._error = error.message || String(error);
          this.render();
        }
      }, true);
      const buttons = this.element("div", undefined, "toolbar");
      buttons.append(download, restore);
      const fileLabel = this.element("label", "Restore from JSON");
      fileLabel.append(file);
      backup.append(fileLabel, buttons);
      root.append(backup);
    }
  }
}

customElements.define("home-presence-panel", HomePresencePanel);
