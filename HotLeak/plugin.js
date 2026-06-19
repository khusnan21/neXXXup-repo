(function () {
    const manifest = {
        baseUrl: "https://hotleak.vip"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://hotleak.vip/"
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

    function decryptStreamUrl(originUrl) {
        if (!originUrl || originUrl.length < 32) return originUrl;
        try {
            let sliced = originUrl.slice(16, -16);
            let reversed = sliced.split("").reverse().join("");
            return atob(reversed);
        } catch (e) {
            console.error("Decryption error:", e.message);
            return originUrl;
        }
    }

    function parseCreatorItems(html) {
        const items = [];
        // Extract div.item
        const regex = /<div class="item"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*src="([^"]+)"[^>]*>[\s\S]*?<div class="movie-name"[^>]*>\s*<h3[^>]*>([^<]+)<\/h3>/gi;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const poster = match[2];
            const title = match[3].trim();
            
            if (href.includes("energizeio.com")) continue;
            
            const fullUrl = href.startsWith('http') ? href : manifest.baseUrl + href;
            const posterUrl = poster.startsWith('http') ? poster : manifest.baseUrl + poster;
            
            items.push(new MultimediaItem({
                title: title,
                url: fullUrl,
                posterUrl: posterUrl,
                type: "series",
                isAdult: true
            }));
        }
        
        // Fallback
        if (items.length === 0) {
            const fallbackRegex = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<div class="movie-name">([\s\S]*?)<\/div>/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                const href = match[1];
                const poster = match[2];
                const titleBlock = match[3];
                const h3Match = titleBlock.match(/<h3[^>]*>([^<]+)<\/h3>/i);
                const title = h3Match ? h3Match[1].trim() : "Creator";
                
                if (href.includes("energizeio.com")) continue;
                
                const fullUrl = href.startsWith('http') ? href : manifest.baseUrl + href;
                const posterUrl = poster.startsWith('http') ? poster : manifest.baseUrl + poster;
                
                items.push(new MultimediaItem({
                    title: title,
                    url: fullUrl,
                    posterUrl: posterUrl,
                    type: "series",
                    isAdult: true
                }));
            }
        }
        
        return items;
    }

    async function getHome(cb) {
        try {
            const categories = {
                "Creators": `${manifest.baseUrl}/creators`,
                "Hot": `${manifest.baseUrl}/hot`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200) {
                        data[name] = parseCreatorItems(res.body).slice(0, 20);
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
            const searchUrl = `${manifest.baseUrl}/search?search=${encodeURIComponent(query)}`;
            const res = await http_get(searchUrl, HEADERS);
            if (res.status === 200) {
                const items = parseCreatorItems(res.body || "");
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
            
            let title = "HotLeak Creator";
            let poster = "";
            let description = "";

            const titleMatch = html.match(/<div class="actor-name"[^>]*>\s*<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].trim();

            const posterMatch = html.match(/img class="model-thumbnail"[^>]*src="([^"]+)"/i) || html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

            const plotMatch = html.match(/<div class="actor-movie"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
            if (plotMatch) description = plotMatch[1].trim();

            const userSlug = url.split("/").filter(Boolean).pop() || "";
            const episodes = [];
            
            // We fetch first 3 pages of creator videos via HotLeak AJAX API
            const requestHeaders = {
                "User-Agent": HEADERS["User-Agent"],
                "X-Requested-With": "XMLHttpRequest",
                "Referer": `${manifest.baseUrl}/${userSlug}/video`,
                "Cookie": "qzqz0=1"
            };

            let episodeNumber = 1;
            for (let page = 1; page <= 3; page++) {
                try {
                    const videoListUrl = `${manifest.baseUrl}/${userSlug}?page=${page}&type=videos&order=0`;
                    const apiRes = await http_get(videoListUrl, requestHeaders);
                    
                    if (apiRes.status === 200 && apiRes.body) {
                        const parsedVideos = JSON.parse(apiRes.body);
                        if (!parsedVideos || parsedVideos.length === 0) {
                            break;
                        }
                        
                        parsedVideos.forEach(video => {
                            const id = video.id || video.user_id;
                            const streamUrlPlay = video.stream_url_play;
                            if (id && streamUrlPlay) {
                                episodes.push(new Episode({
                                    name: video.description || `Video ID: ${id}`,
                                    url: `${userSlug}|${streamUrlPlay}`,
                                    season: 1,
                                    episode: episodeNumber,
                                    posterUrl: video.thumbnail || poster
                                }));
                                episodeNumber++;
                            }
                        });
                    } else {
                        break;
                    }
                } catch (e) {
                    console.error("Error fetching creator videos on page " + page + ":", e.message);
                    break;
                }
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    description: description,
                    type: "series",
                    isAdult: true,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const parts = url.split("|");
            if (parts.length < 2) {
                return cb({ success: false, errorCode: "NO_STREAMS" });
            }
            
            const userSlug = parts[0];
            const encryptedUrl = parts[1];
            const decryptedUrl = decryptStreamUrl(encryptedUrl);

            if (decryptedUrl && decryptedUrl.startsWith("http")) {
                const streams = [
                    new StreamResult({
                        url: decryptedUrl,
                        source: "HotLeak Play",
                        headers: {
                            "Referer": manifest.baseUrl + "/",
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    })
                ];
                cb({ success: true, data: streams });
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
