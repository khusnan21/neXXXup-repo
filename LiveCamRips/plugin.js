(function () {
    const manifest = {
        baseUrl: "https://livecamrips.to"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://livecamrips.to/"
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

    function parseGalleryItems(html) {
        const items = [];
        // Match cards which typically have links containing target URLs, and nested images + titles
        const cardRegex = /<div class="col-xl-3 col-lg-4 col-md-6 col-sm-6 col-12 mb-5 tm-gallery-item"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const block = match[1];
            const hrefMatch = block.match(/href="([^"]+)"/i);
            const imgMatch = block.match(/src="([^"]+)"/i);
            const titleMatch = block.match(/<span[^>]*class="[^"]*tm-text-gray-light[^"]*"[^>]*>([^<]+)<\/span>/i);

            if (hrefMatch && imgMatch && titleMatch) {
                const href = hrefMatch[1].trim();
                const poster = imgMatch[1].trim();
                const title = titleMatch[1].trim();
                const fullUrl = href.startsWith("http") ? href : manifest.baseUrl + href;
                const posterUrl = poster.startsWith("http") ? poster : manifest.baseUrl + poster;

                items.push(new MultimediaItem({
                    title: title,
                    url: fullUrl,
                    posterUrl: posterUrl,
                    type: "movie",
                    isAdult: true
                }));
            }
        }

        // Secondary fallback match
        if (items.length === 0) {
            const fallbackRegex = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<span[^>]+class="[^"]*tm-text-gray-light[^"]*"[^>]*>([^<]+)<\/span>/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                const href = match[1];
                const poster = match[2];
                const title = match[3].trim();
                const fullUrl = href.startsWith("http") ? href : manifest.baseUrl + href;
                const posterUrl = poster.startsWith("http") ? poster : manifest.baseUrl + poster;

                items.push(new MultimediaItem({
                    title: title,
                    url: fullUrl,
                    posterUrl: posterUrl,
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
                "Latest (18+)": "https://livecamrips.to/tag/18",
                "Petite": "https://livecamrips.to/tag/petite",
                "Cute": "https://livecamrips.to/tag/cute",
                "Couple": "https://livecamrips.to/tag/couple",
                "Goth": "https://livecamrips.to/tag/goth",
                "Elegant": "https://livecamrips.to/tag/elegant",
                "Milf": "https://livecamrips.to/tag/milf",
                "Shy": "https://livecamrips.to/tag/shy",
                "Latina": "https://livecamrips.to/tag/latina"
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200) {
                        data[name] = parseGalleryItems(res.body).slice(0, 20);
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
            const searchUrl = `https://livecamrips.to/search/${encodeURIComponent(query)}`;
            const res = await http_get(searchUrl, HEADERS);
            if (res.status === 200) {
                cb({ success: true, data: parseGalleryItems(res.body) });
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
            
            let title = "LiveCamRips Video";
            let poster = "";
            let description = "";

            const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            if (h1Match) title = h1Match[1].trim();

            const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (imgMatch) poster = imgMatch[1];

            const descMatch = html.match(/<div class="video-caption"[^>]*>([\s\S]*?)<\/div>/i);
            if (descMatch) {
                const cleanDesc = descMatch[1].replace(/<[^>]+>/g, "").trim();
                description = cleanDesc;
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
            
            // Extract iframe with embed URL or video source
            let iframeUrl = "";
            const iframeMatch = html.match(/<iframe[^>]+class="[^"]*embed-responsive-item[^"]*"[^>]+src="([^"]+)"/i) || html.match(/<iframe[^>]+src="([^"]+)"[^>]*class="[^"]*embed-responsive-item[^"]*"/i) || html.match(/<iframe[^>]+src="([^"]+)"/i);
            
            if (iframeMatch) {
                iframeUrl = iframeMatch[1];
                if (iframeUrl.includes("mdzsmutpcvykb")) {
                    iframeUrl = iframeUrl.replace("mdzsmutpcvykb.net", "mixdrop.co");
                }
            }

            if (iframeUrl) {
                cb({
                    success: true,
                    data: [
                        new StreamResult({
                            url: "MAGIC_PROXY_v1" + btoa(iframeUrl),
                            source: "Mixdrop Player",
                            headers: {
                                "Referer": url,
                                "User-Agent": HEADERS["User-Agent"]
                            }
                        })
                    ]
                });
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
