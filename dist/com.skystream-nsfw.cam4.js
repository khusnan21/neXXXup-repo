(function () {
    const manifest = {
        baseUrl: "https://www.cam4.com"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.cam4.com/"
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
                "All": "https://www.cam4.com/api/directoryCams?directoryJson=true&online=true&url=true&orderBy=VIDEO_QUALITY&resultsPerPage=60",
                "Female": "https://www.cam4.com/api/directoryCams?directoryJson=true&online=true&url=true&orderBy=VIDEO_QUALITY&gender=female&broadcastType=female_group&broadcastType=solo&broadcastType=male_female_group&resultsPerPage=60",
                "Male": "https://www.cam4.com/api/directoryCams?directoryJson=true&online=true&url=true&orderBy=VIDEO_QUALITY&gender=male&broadcastType=male_group&broadcastType=solo&broadcastType=male_female_group&resultsPerPage=60",
                "Transgender": "https://www.cam4.com/api/directoryCams?directoryJson=true&online=true&url=true&orderBy=VIDEO_QUALITY&gender=shemale&resultsPerPage=60",
                "Couples": "https://www.cam4.com/api/directoryCams?directoryJson=true&online=true&url=true&orderBy=VIDEO_QUALITY&broadcastType=male_group&broadcastType=female_group&broadcastType=male_female_group&resultsPerPage=60"
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200) {
                        const parsed = JSON.parse(res.body);
                        const users = parsed.users || [];
                        data[name] = users.slice(0, 20).map(user => new MultimediaItem({
                            title: user.username,
                            url: `https://www.cam4.com/${user.username}`,
                            posterUrl: user.snapshotImageLink,
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
        // Cam4 doesn't have native search supported in provider, we return empty list
        cb({ success: true, data: [] });
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            
            let title = "Cam4 Stream";
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
            const username = url.split("/").filter(Boolean).pop();
            if (!username) {
                return cb({ success: false, errorCode: "NO_STREAMS" });
            }
            const apiUrl = `https://www.cam4.com/rest/v1.0/profile/${username}/streamInfo`;
            const extraHeaders = {
                "User-Agent": HEADERS["User-Agent"],
                "Accept": "application/json",
                "Referer": url
            };
            const res = await http_get(apiUrl, extraHeaders);
            if (res.status === 200) {
                const streamData = JSON.parse(res.body);
                const cdnURL = streamData.cdnURL;
                if (cdnURL) {
                    const streams = [
                        new StreamResult({
                            url: cdnURL,
                            source: "Cam4 Live",
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
