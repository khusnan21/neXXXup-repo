(function () {
    const manifest = {
        baseUrl: "https://www.camsoda.com"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.camsoda.com/"
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
                "Girls": "https://www.camsoda.com/api/v1/browse/react?gender-hide=m,t,c&perPage=98",
                "Male": "https://www.camsoda.com/api/v1/browse/react?gender-hide=c,f,t&perPage=98",
                "Transgender": "https://www.camsoda.com/api/v1/browse/react?gender-hide=c,f,m&perPage=98",
                "Couples": "https://www.camsoda.com/api/v1/browse/react?gender-hide=m,f,t&perPage=98"
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url + "&p=1", HEADERS);
                    if (res.status === 200) {
                        const parsed = JSON.parse(res.body);
                        const userList = parsed.userList || [];
                        data[name] = userList.slice(0, 20).map(user => {
                            const poster = (user.offlinePictureUrl && user.offlinePictureUrl.length > 0) ? user.offlinePictureUrl : user.thumbUrl;
                            return new MultimediaItem({
                                title: user.username,
                                url: `https://www.camsoda.com/${user.username}`,
                                posterUrl: poster,
                                type: "movie",
                                isAdult: true
                            });
                        });
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
            const out = [];
            // Try searching up to 2 pages (0 and 1) to keep it fast
            for (let page = 0; page <= 1; page++) {
                const searchUrl = `https://www.camsoda.com/api/v1/browse/react/search/${encodeURIComponent(query)}?p=${page}&perPage=98`;
                const res = await http_get(searchUrl, HEADERS);
                if (res.status === 200) {
                    const parsed = JSON.parse(res.body);
                    const userList = parsed.userList || [];
                    if (userList.length === 0) break;
                    userList.forEach(user => {
                        const poster = (user.offlinePictureUrl && user.offlinePictureUrl.length > 0) ? user.offlinePictureUrl : user.thumbUrl;
                        if (!out.find(x => x.title === user.username)) {
                            out.push(new MultimediaItem({
                                title: user.username,
                                url: `https://www.camsoda.com/${user.username}`,
                                posterUrl: poster,
                                type: "movie",
                                isAdult: true
                            }));
                        }
                    });
                } else {
                    break;
                }
            }
            cb({ success: true, data: out });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            
            let title = "Camsoda Stream";
            let poster = "";
            let description = "";

            const username = url.split("/").filter(Boolean).pop() || "User";
            title = username;

            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || html.match(/<meta property="twitter:image" content="([^"]+)"/i);
            if (posterMatch) {
                poster = posterMatch[1];
            }

            const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
            if (descMatch) {
                description = descMatch[1];
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    description: description,
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
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            
            // Extract window.__PRELOADED_STATE__ from script tag
            const match = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})(?:;?\s*\n|;?\s*<\/script>)/) || html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/);
            if (!match) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "PRELOADED_STATE not found" });
            }

            let state;
            try {
                // Remove trailing semicolons and clean up
                let jsonStr = match[1].trim();
                state = JSON.parse(jsonStr);
            } catch (jsonErr) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "PRELOADED_STATE parse error" });
            }

            const username = state.chatPage && state.chatPage.username;
            if (!username) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "Username not found in state" });
            }

            const chatRoom = state.chatRoom;
            const roomByUsername = chatRoom && chatRoom.roomByUsername;
            const userRoom = roomByUsername && roomByUsername[username];
            const stream = userRoom && userRoom.stream;

            if (!stream) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "Stream info not found in state" });
            }

            const edgeServers = stream.edge_servers || [];
            const streamName = stream.stream_name;
            const token = stream.token;

            if (!streamName || !token || edgeServers.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "Stream parameters not found" });
            }

            const streams = edgeServers.map((server, i) => {
                const finalUrl = `https://${server}/${streamName}_v1/index.m3u8?token=${token}`;
                return new StreamResult({
                    url: finalUrl,
                    source: `Camsoda Server ${i + 1}`,
                    headers: {
                        "Referer": url,
                        "User-Agent": HEADERS["User-Agent"]
                    }
                });
            });

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
