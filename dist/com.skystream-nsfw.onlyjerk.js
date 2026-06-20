(function () {
    const manifest = {
        baseUrl: "https://onlyjerk.net"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://onlyjerk.net/"
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

    function parsePostItems(html) {
        const items = [];
        // Match td-cpt-post structure
        const postPattern = /<div class="[^"]*td-cpt-post[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
        let match;
        while ((match = postPattern.exec(html)) !== null) {
            const block = match[1];
            const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]+title="([^"]+)"/i);
            const styleMatch = block.match(/background-image\s*:\s*url\((['"]?)([^)'"\s]+)\1\)/i) || block.match(/url\((['"]?)([^)'"\s]+)\1\)/i);

            if (linkMatch) {
                const href = linkMatch[1];
                const title = linkMatch[2];
                const poster = styleMatch ? styleMatch[2] : "";

                items.push(new MultimediaItem({
                    title: title.trim(),
                    url: href.trim(),
                    posterUrl: poster.trim(),
                    type: "movie",
                    isAdult: true
                }));
            }
        }

        // General fallback
        if (items.length === 0) {
            const fallbackPattern = /<a[^>]+href="([^"]+)"[^>]+title="([^"]+)"[^>]*>[\s\S]*?<span[^>]+style="[^"]*background-image:[^"]*url\(([^)]+)\)[^"]*"/gi;
            while ((match = fallbackPattern.exec(html)) !== null) {
                const href = match[1];
                const title = match[2];
                let poster = match[3];
                // Clean up any remaining quotes around poster url
                poster = poster.replace(/['"]/g, "").trim();

                items.push(new MultimediaItem({
                    title: title.trim(),
                    url: href.trim(),
                    posterUrl: poster.trim(),
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
                "Latest Onlyfans": "https://onlyjerk.net/videos",
                "Featured": "https://onlyjerk.net/featured",
                "Trending": "https://onlyjerk.net/trending",
                "Camwhores": "https://onlyjerk.net/camwhores",
                "Fansly": "https://onlyjerk.net/fansly",
                "Manyvids": "https://onlyjerk.net/manyvids",
                "Porn": "https://onlyjerk.net/porn"
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url + "/page/1/", HEADERS);
                    if (res.status === 200) {
                        data[name] = parsePostItems(res.body).slice(0, 20);
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
            for (let page = 1; page <= 2; page++) {
                const searchUrl = `https://onlyjerk.net/page/${page}/?s=${encodeURIComponent(query)}`;
                const res = await http_get(searchUrl, HEADERS);
                if (res.status === 200) {
                    const items = parsePostItems(res.body);
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
            
            let title = "Onlyjerk Video";
            let poster = "";
            let description = "";

            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
            if (titleMatch) title = titleMatch[1];

            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

            const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
            if (descMatch) description = descMatch[1];

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
            
            // Extract iframe sources inside .tabcontent
            const iframePattern = /<iframe[^>]+(?:src|data-litespeed-src)="([^"]+)"/gi;
            let match;
            while ((match = iframePattern.exec(html)) !== null) {
                const src = match[1];
                if (src && (src.includes("embed") || src.includes("player") || src.includes("dood") || src.includes("mixdrop") || src.includes("listeamed"))) {
                    streams.push(new StreamResult({
                        url: "MAGIC_PROXY_v1" + btoa(src),
                        source: "Onlyjerk Tab Iframe",
                        headers: {
                            "Referer": url,
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            // Extract href from wp-block-button > a buttons
            const buttonPattern = /<div class="[^"]*wp-block-button[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"/gi;
            while ((match = buttonPattern.exec(html)) !== null) {
                const href = match[1];
                if (href && (href.includes("embed") || href.includes("player") || href.includes("dood") || href.includes("mixdrop") || href.includes("listeamed"))) {
                    streams.push(new StreamResult({
                        url: "MAGIC_PROXY_v1" + btoa(href),
                        source: "Onlyjerk Button Link",
                        headers: {
                            "Referer": url,
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            if (streams.length === 0) {
                // Return any found iframe as a fallback
                const fallbackIframePattern = /<iframe[^>]+src="([^"]+)"/gi;
                while ((match = fallbackIframePattern.exec(html)) !== null) {
                    const src = match[1];
                    streams.push(new StreamResult({
                        url: "MAGIC_PROXY_v1" + btoa(src),
                        source: "Iframe Player",
                        headers: {
                            "Referer": url,
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
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
