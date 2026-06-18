(function () {
    // 1. Configuration aur Dependencies
    const manifest = {
        baseUrl: "https://beeg24.org"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://beeg24.org/"
    };

    // 2. Network Utility (Zaroori function)
    async function http_get(url, headers = {}) {
        try {
            const response = await fetch(url, { method: 'GET', headers: headers });
            const body = await response.text();
            return { status: response.status, body: body };
        } catch (e) {
            throw new Error(e.message);
        }
    }

    // 3. Helper Functions
    function parseVideoItems(html) {
        const items = [];
        const itemPattern = /<div class="small">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img src="([^"]+)" alt="([^"]+)"[^>]*>/gi;
        let match;
        while ((match = itemPattern.exec(html)) !== null) {
            const href = match[1];
            const posterSrc = match[2];
            const altText = match[3];
            const title = altText.split('(')[0].trim();
            const fullUrl = href.startsWith('http') ? href : manifest.baseUrl + href;
            const posterUrl = posterSrc.startsWith('http') ? posterSrc : manifest.baseUrl + posterSrc;
            
            if (title && href) {
                items.push(new MultimediaItem({
                    title: title, url: fullUrl, posterUrl: posterUrl,
                    type: "movie", isAdult: true
                }));
            }
        }
        return items;
    }

    // 4. API Methods (Global Export)
    async function getHome(cb) {
        try {
            const categories = {
                "Home": manifest.baseUrl,
                "Most Viewed": `${manifest.baseUrl}/top-50-most-viewed-videos.html`,
                "Top Rated": `${manifest.baseUrl}/top-porn-videos.html`
            };
            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                const res = await http_get(url, HEADERS);
                if (res.status === 200) data[name] = parseVideoItems(res.body).slice(0, 20);
            }
            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const searchUrl = `${manifest.baseUrl}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
            const res = await http_get(searchUrl, HEADERS);
            const items = parseVideoItems(res.body || "");
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            let titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<title>(.*?)<\/title>/i);
            let posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            
            cb({
                success: true,
                data: new MultimediaItem({
                    title: titleMatch ? titleMatch[1].trim() : "Unknown",
                    url: url,
                    posterUrl: posterMatch ? posterMatch[1] : "",
                    type: "movie", isAdult: true
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
            
            // Regex for video sources
            const videoPattern = /<source[^>]*src="([^"]+)"/gi;
            let match;
            while ((match = videoPattern.exec(html)) !== null) {
                streams.push(new StreamResult({
                    url: match[1],
                    source: "Direct",
                    headers: { "Referer": url, "User-Agent": HEADERS["User-Agent"] }
                }));
            }
            
            if (streams.length > 0) cb({ success: true, data: streams });
            else cb({ success: false, errorCode: "NO_STREAMS" });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // Global Exposure
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
