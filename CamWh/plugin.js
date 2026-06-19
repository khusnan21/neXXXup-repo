(function () {
    const manifest = {
        baseUrl: "https://camwh.com"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://camwh.com/"
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

    function parseVideoItems(html) {
        const items = [];
        // Pattern: Matches item cards on CamWh
        const regex = /<div class="item"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<img[^>]*data-original="([^"]+)"[^>]*>/gi;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const title = match[2].trim();
            const poster = match[3];
            
            const fullUrl = href.startsWith('http') ? href : manifest.baseUrl + href;
            const posterUrl = poster.startsWith('http') ? poster : manifest.baseUrl + poster;
            
            items.push(new MultimediaItem({
                title: title,
                url: fullUrl,
                posterUrl: posterUrl,
                type: "movie",
                isAdult: true
            }));
        }
        
        // Fallback for different image attributes (e.g., src, data-src)
        if (items.length === 0) {
            const fallbackRegex = /<div class="item"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-original|data-webp)="([^"]+)"[^>]*>/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                const href = match[1];
                const title = match[2].trim();
                const poster = match[3];
                
                const fullUrl = href.startsWith('http') ? href : manifest.baseUrl + href;
                const posterUrl = poster.startsWith('http') ? poster : manifest.baseUrl + poster;
                
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
                "Latest Videos": `${manifest.baseUrl}/latest-updates/`,
                "Top Rated Videos": `${manifest.baseUrl}/top-rated/`,
                "Most Viewed Videos": `${manifest.baseUrl}/most-popular/`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200) {
                        data[name] = parseVideoItems(res.body).slice(0, 20);
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
            const searchUrl = `${manifest.baseUrl}/search/${encodeURIComponent(query)}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${encodeURIComponent(query)}&category_ids=&sort_by=&from_videos=1&from_albums=1`;
            const res = await http_get(searchUrl, HEADERS);
            if (res.status === 200) {
                const items = parseVideoItems(res.body || "");
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
            
            let title = "CamWh Video";
            let poster = "";

            const titleMatch = html.match(/<div class="headline"[^>]*>\s*<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].trim();

            const posterMatch = html.match(/<div class="fp-poster"[^>]*>\s*<img[^>]*src="([^"]+)"/i) || html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

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
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            
            // Search inside HTML for video source script configuration or player variables
            let videoSourceUrl = "";
            
            // Pattern 1: search for get_file pattern URL
            const getFileMatch = html.match(/["'](https?:\/\/[^"']+\/get_file\/[^"']+)["']/i);
            if (getFileMatch) {
                videoSourceUrl = getFileMatch[1];
            }
            
            // Pattern 2: search for flashvars of the player (video_url / license_code / etc)
            if (!videoSourceUrl) {
                const flashvarsMatch = html.match(/video_url:\s*['"]([^'"]+)['"]/i) || html.match(/file:\s*['"]([^'"]+)['"]/i);
                if (flashvarsMatch) {
                    videoSourceUrl = flashvarsMatch[1];
                }
            }

            // Pattern 3: general src match inside source tags
            if (!videoSourceUrl) {
                const sourceMatch = html.match(/<source[^>]*src="([^"]+)"/i);
                if (sourceMatch) {
                    videoSourceUrl = sourceMatch[1];
                }
            }

            if (videoSourceUrl) {
                const streams = [
                    new StreamResult({
                        url: videoSourceUrl,
                        source: "CamWh Stream",
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
