(function () {
    const manifest = {
        baseUrl: "https://internetchicks.com"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://internetchicks.com/"
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

    function parseArticleItems(html) {
        const items = [];
        // Matches <article ...> ... </article>
        const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
        let match;
        while ((match = articleRegex.exec(html)) !== null) {
            const block = match[1];
            
            // Extract href and title from header > h2 > a
            const aMatch = block.match(/<header[^>]*>\s*<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
            // Extract poster from img src/data-src
            const imgMatch = block.match(/<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>/i);

            if (aMatch) {
                const href = aMatch[1].trim();
                const title = aMatch[2].trim();
                const poster = imgMatch ? imgMatch[1].trim() : "";
                
                items.push(new MultimediaItem({
                    title: title,
                    url: href,
                    posterUrl: poster,
                    type: "movie",
                    isAdult: true
                }));
            }
        }
        return items;
    }

    async function getHome(cb) {
        try {
            const categories = {
                "Onlyfans": "https://internetchicks.com/category/onlyfans",
                "Femdom": "https://internetchicks.com/category/femdom",
                "ASMR": "https://internetchicks.com/category/asmr",
                "Patreon": "https://internetchicks.com/category/patreon",
                "Random": "https://internetchicks.com/category/manyvids",
                "Tiktok": "https://internetchicks.com/category/tiktok",
                "Webcam": "https://internetchicks.com/category/webcam",
                "Snapchat": "https://internetchicks.com/category/snapchat"
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url + "/page/1/", HEADERS);
                    if (res.status === 200) {
                        data[name] = parseArticleItems(res.body).slice(0, 20);
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
            // Try fetching first 2 pages
            for (let page = 1; page <= 2; page++) {
                const searchUrl = `https://internetchicks.com/page/${page}/?s=${encodeURIComponent(query)}&id=5036`;
                const res = await http_get(searchUrl, HEADERS);
                if (res.status === 200) {
                    const items = parseArticleItems(res.body);
                    if (items.length === 0) break;
                    items.forEach(item => {
                        if (!out.find(x => x.url === item.url)) {
                            out.push(item);
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
            
            let title = "Internetchicks Video";
            let poster = "";
            let description = "";

            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].trim();

            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

            const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
            if (descMatch) description = descMatch[1].trim();

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
            
            const streams = [];
            
            // Extract any playEmbed URL: e.g. playEmbed('https://example.com/embed')
            const embedPattern = /playEmbed\(\s*['"]([^'"]+)['"]\s*\)/gi;
            let match;
            while ((match = embedPattern.exec(html)) !== null) {
                const embedUrl = match[1];
                if (embedUrl) {
                    streams.push(new StreamResult({
                        url: "MAGIC_PROXY_v1" + btoa(embedUrl),
                        source: "Internetchicks Embed",
                        headers: {
                            "Referer": url,
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            // Fallback: look for general iframes
            if (streams.length === 0) {
                const iframePattern = /<iframe[^>]+src="([^"]+)"[^>]*>/gi;
                while ((match = iframePattern.exec(html)) !== null) {
                    const iframeUrl = match[1];
                    if (iframeUrl.includes("player") || iframeUrl.includes("embed") || iframeUrl.includes("video")) {
                        streams.push(new StreamResult({
                            url: "MAGIC_PROXY_v1" + btoa(iframeUrl),
                            source: "Internetchicks Iframe",
                            headers: {
                                "Referer": url,
                                "User-Agent": HEADERS["User-Agent"]
                            }
                        }));
                    }
                }
            }

            if (streams.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS" });
            }

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
