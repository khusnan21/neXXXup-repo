(function () {
    const manifest = {
        baseUrl: "https://www.porn4fans.com"
    };

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.porn4fans.com/"
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
        // Pattern matches: <div class="item"> with a link carrying title & href, plus an image carrying src
        const regex = /<div class="item"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/gi;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const title = match[2].trim();
            const poster = match[3];
            
            const fullUrl = href.startsWith('http') ? href : manifest.baseUrl + href;
            const posterUrl = poster.startsWith('http') ? poster : manifest.baseUrl + poster;
            
            if (title && href) {
                items.push(new MultimediaItem({
                    title: title,
                    url: fullUrl,
                    posterUrl: posterUrl,
                    type: "movie",
                    isAdult: true
                }));
            }
        }
        
        // Secondary fallback
        if (items.length === 0) {
            const itemPattern = /<div class="item"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
            while ((match = itemPattern.exec(html)) !== null) {
                const block = match[1];
                const hrefMatch = block.match(/href="([^"]+)"/i);
                const titleMatch = block.match(/title="([^"]+)"/i) || block.match(/alt="([^"]+)"/i);
                const imgMatch = block.match(/src="([^"]+)"/i);
                
                if (hrefMatch && titleMatch && imgMatch) {
                    const href = hrefMatch[1];
                    const title = titleMatch[1].trim();
                    const poster = imgMatch[1];
                    
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
        }
        
        return items;
    }

    async function getHome(cb) {
        try {
            const categories = {
                "Latest": `${manifest.baseUrl}/onlyfans-videos/1/`,
                "Roleplay": `${manifest.baseUrl}/categories/roleplay-fantasy/1/`,
                "Pornstars": `${manifest.baseUrl}/categories/pornstar/1/`,
                "Petite": `${manifest.baseUrl}/categories/petite/1/`,
                "Milf": `${manifest.baseUrl}/categories/milf/1/`,
                "Masturbation": `${manifest.baseUrl}/categories/masturbation/1/`
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
            const searchResponseItems = [];
            // We search first few pages
            for (let page = 1; page <= 3; page++) {
                const searchUrl = `${manifest.baseUrl}/search/${encodeURIComponent(query)}/?mode=async&function=get_block&block_id=custom_list_videos_videos_list_search_result&q=${encodeURIComponent(query)}&category_ids&sort_by&from_videos=${page}&from_albums=${page}`;
                const res = await http_get(searchUrl, HEADERS);
                if (res.status === 200 && res.body) {
                    const pageItems = parseVideoItems(res.body);
                    if (pageItems.length === 0) break;
                    pageItems.forEach(item => {
                        if (!searchResponseItems.find(x => x.url === item.url)) {
                            searchResponseItems.push(item);
                        }
                    });
                } else {
                    break;
                }
            }
            cb({ success: true, data: searchResponseItems });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            
            // Extract ld+json metadata
            const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
            if (ldMatch) {
                try {
                    const parsed = JSON.parse(ldMatch[1].trim());
                    let title = parsed.name || "Porn4fans Stream";
                    let poster = parsed.thumbnailUrl || "";
                    let streamsUrl = parsed.contentUrl || "";
                    
                    cb({
                        success: true,
                        data: new MultimediaItem({
                            title: title,
                            url: url,
                            posterUrl: poster,
                            type: "movie",
                            isAdult: true,
                            // Save streamsUrl in custom metadata to retrieve in loadStreams
                            customMetadata: { streamUrl: streamsUrl }
                        })
                    });
                    return;
                } catch (e) {
                    console.error("ld+json parse error, using fallbacks");
                }
            }

            // Fallback scraping
            let title = "Porn4fans Video";
            let poster = "";
            let streamUrlFallback = "";

            const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            if (h1Match) title = h1Match[1].trim();

            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

            const sourceStreamMatch = html.match(/<source[^>]*src="([^"]+)"[^>]*type="video\/mp4"/i) || html.match(/"contentUrl":\s*"([^"]+)"/i);
            if (sourceStreamMatch) streamUrlFallback = sourceStreamMatch[1];

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    type: "movie",
                    isAdult: true,
                    customMetadata: { streamUrl: streamUrlFallback }
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            // Re-fetch the page if standard link lacks properties, or try to read it
            const res = await http_get(url, HEADERS);
            const html = res.body || "";
            let streamUrl = "";

            const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
            if (ldMatch) {
                try {
                    const parsed = JSON.parse(ldMatch[1].trim());
                    streamUrl = parsed.contentUrl || "";
                } catch (e) {}
            }

            if (!streamUrl) {
                const sourceStreamMatch = html.match(/<source[^>]*src="([^"]+)"[^>]*type="video\/mp4"/i) || html.match(/"contentUrl":\s*"([^"]+)"/i);
                if (sourceStreamMatch) streamUrl = sourceStreamMatch[1];
            }

            if (streamUrl) {
                const streams = [
                    new StreamResult({
                        url: streamUrl,
                        source: "Porn4fans Direct",
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
