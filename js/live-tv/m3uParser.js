export function parseM3U(text = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.toUpperCase().startsWith("#EXTINF")) continue;

    const commaIndex = line.indexOf(",");
    const metadata = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
    const fallbackName =
      commaIndex >= 0
        ? line.slice(commaIndex + 1).trim()
        : "Unknown Channel";

    let url = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].startsWith("#")) {
        url = lines[j];
        i = j;
        break;
      }
    }

    if (!url) continue;

    const getAttr = key => {
      const match = metadata.match(
        new RegExp(`${key}\\s*=\\s*"([^"]*)"`, "i")
      );
      return match ? match[1].trim() : "";
    };

    const getUnquotedAttr = key => {
      const match = metadata.match(
        new RegExp(`${key}\\s*=\\s*([^\\s"]+)`, "i")
      );
      return match ? match[1].trim() : "";
    };

    const name =
      getAttr("tvg-name") ||
      fallbackName ||
      `Channel ${channels.length + 1}`;

    const id =
      getAttr("tvg-id") ||
      getUnquotedAttr("tvg-id") ||
      `channel-${channels.length + 1}`;

    const group =
      getAttr("group-title") ||
      getUnquotedAttr("group-title") ||
      "Other";

    const logo =
      getAttr("tvg-logo") ||
      getUnquotedAttr("tvg-logo") ||
      "";

    channels.push({
      id: String(id),
      name: String(name),
      logo: String(logo),
      group: String(group),
      url: String(url),
    });
  }

  return channels;
}

export function parseM3UFile(file) {
  if (!(file instanceof File)) {
    return Promise.reject(new TypeError("A valid M3U File is required."));
  }

  return file.text().then(parseM3U);
}
