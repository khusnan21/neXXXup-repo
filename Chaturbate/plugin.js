(function () {
    const manifest = {
        baseUrl: "https://chaturbate.com"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://chaturbate.com/"
    };

    async function http_get(url, headers = {}) {
        try {
            const response = await fetch(url, { method: 'GET', headers: headers });
            const body = await response.text();
            return { status: response.status, body: body };
        } catch (e) {
            throw new Error(e.message);
        }
    }

    async function getHome(cb) {
        try {
            const categories = {
                "Featured": "https://chaturbate.com/api/ts/roomlist/room-list/?limit=90",
                "Female": "https://chaturbate.com/api/ts/roomlist/room-list/?genders=f&limit=90",
                "Couples": "https://chaturbate.com/api/ts/roomlist/room-list/?genders=c&limit=90",
                "Asia": "https://chaturbate.com/api/ts/roomlist/room-list/?regions=AS&limit=90",
                "Europe/Russia": "https://chaturbate.com/api/ts/roomlist/room-list/?regions=ER&limit=90"
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200) {
                        const parsed = JSON.parse(res.body);
                        const rooms = parsed.rooms || [];
                        data[name] = rooms.slice(0, 20).map(room => new MultimediaItem({
                            title: room.username,
                            url: `https://chaturbate.com/${room.username}`,
                            posterUrl: room.img,
                            type: "movie",
                            isAdult: true
                        }));
                    }
                } catch (err) {
                    console.error(`Error fetching category ${name}: ${err.message}`);
                }
            }
            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const searchUrl = `https://chaturbate.com/api/ts/roomlist/room-list/?keywords=${encodeURIComponent(query)}&limit=90&offset=0`;
            const extraHeaders = {
                ...HEADERS,
                "X-Requested-With": "XMLHttpRequest"
            };
            const res = await http_get(searchUrl, extraHeaders);
            if (res.status === 200) {
                const parsed = JSON.parse(res.body);
                const rooms = parsed.rooms || [];
                const items = rooms.map(room => new MultimediaItem({
                    title: room.username,
                    url: `https://chaturbate.com/${room.username}`,
                    posterUrl: room.img,
                    type: "movie",
                    isAdult: true
                }));
                cb({ success: true, data: items });
            } else {
                cb({ success: false, errorCode: "NETWORK_ERROR" });
            }
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            let title = "Chaturbate Stream";
            let poster = "";

            const username = url.split("/").filter(Boolean).pop() || "User";
            title = username;

            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || html.match(/<meta property="twitter:image" content="([^"]+)"/i);
            if (posterMatch) {
                poster = posterMatch[1];
            } else {
                poster = `https://roomimages.chstatic.com/get_image/${username}/`;
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    type: "movie",
                    isAdult: true
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const username = url.split("/").filter(Boolean).pop();
            if (!username) {
                return cb({ success: false, errorCode: "NO_STREAMS" });
            }
            const apiUrl = `https://chaturbate.com/api/chatvideocontext/${username}/`;
            const extraHeaders = {
                "User-Agent": HEADERS["User-Agent"],
                "X-Requested-With": "XMLHttpRequest",
                "Referer": url,
                "Accept": "application/json"
            };
            const res = await http_get(apiUrl, extraHeaders);
            if (res.status === 200) {
                const chatData = JSON.parse(res.body);
                const m3u8Url = chatData.hls_source;
                if (m3u8Url) {
                    const streams = [
                        new StreamResult({
                            url: m3u8Url,
                            source: "Chaturbate Live",
                            headers: {
                                "Referer": url,
                                "User-Agent": HEADERS["User-Agent"]
                            }
                        })
                    ];
                    cb({ success: true, data: streams });
                } else {
                    cb({ success: false, errorCode: "NO_STREAMS" });
                }
            } else {
                cb({ success: false, errorCode: "NO_STREAMS" });
            }
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
