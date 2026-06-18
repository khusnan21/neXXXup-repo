/**
 * WOW.XXX Plugin for SkyStream
 * Source: https://www.wow.xxx
 * Features: Multi-Category Grid Layout Fix, Search, Video Streams, Multi-Server Extractor
 */

(function () {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.wow.xxx/"
    };

    function parseVideoItems(html) {
        const items = [];
        const itemPattern = /<div class="item">[\s\S]*?<a href="(https:\/\/www\.wow\.xxx\/videos\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<\/div>/g;
        
        let match;
        while ((match = itemPattern.exec(html)) !== null) {
            items.push(new MultimediaItem({
                title: match[3].trim(),
                url: match[1],
                posterUrl: match[2],
                type: "movie",
                isAdult: true
            }));
        }
        
        if (items.length === 0) {
            const simplePattern = /<a href="(https:\/\/www\.wow\.xxx\/videos\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/g;
            while ((match = simplePattern.exec(html)) !== null) {
                items.push(new MultimediaItem({
                    title: match[3].trim(),
                    url: match[1],
                    posterUrl: match[2],
                    type: "movie",
                    isAdult: true
                }));
            }
        }
        return items;
    }

    function parseCategoryItems(html) {
        const items = [];
        const catItemPattern = /<a href="(https:\/\/www\.wow\.xxx\/videos\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/gi;
        
        let match;
        while ((match = catItemPattern.exec(html)) !== null) {
            if (!items.some(i => i.url === match[1])) {
                items.push(new MultimediaItem({
                    title: match[3].trim(),
                    url: match[1],
                    posterUrl: match[2],
                    type: "movie",
                    isAdult: true
                }));
            }
        }
        return items;
    }

    // IMPROVED PARSER for category pages
    function parseCategoryItemsImproved(html) {
        const items = [];
        
        const pattern1 = /<a[^>]+href="(https?:\/\/www\.wow\.xxx\/videos\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"/gi;
        let match;
        while ((match = pattern1.exec(html)) !== null) {
            if (match[1] && match[1].includes('/videos/') && match[3] && !match[3].includes('WOW.XXX')) {
                items.push(new MultimediaItem({
                    title: match[3].trim(),
                    url: match[1],
                    posterUrl: match[2],
                    type: "movie",
                    isAdult: true
                }));
            }
        }
        
        if (items.length === 0) {
            const pattern2 = /<a[^>]+href="(https?:\/\/www\.wow\.xxx\/videos\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+data-src="([^"]+)"[^>]+alt="([^"]+)"/gi;
            while ((match = pattern2.exec(html)) !== null) {
                items.push(new MultimediaItem({
                    title: match[3].trim(),
                    url: match[1],
                    posterUrl: match[2],
                    type: "movie",
                    isAdult: true
                }));
            }
        }
        return items;
    }

    /**
     * Get homepage content with categories (FIXED)
     */
    async function getHome(cb) {
        try {
            const baseUrl = manifest.baseUrl || "https://www.wow.xxx";
            
            // CORRECTED URLs - With "/categories/" path
            const categories = {
                "Latest Videos": `${baseUrl}/`,
                "Most Popular": `${baseUrl}/most-popular/`,
                "Big Ass": `${baseUrl}/categories/big-ass`,
                "Big Cock": `${baseUrl}/categories/big-cock`,
                "MILF": `${baseUrl}/categories/milf`,
                "Mature": `${baseUrl}/categories/mature`,
                "Latina": `${baseUrl}/categories/latina`,
                "Indian": `${baseUrl}/categories/indian`,
                "Interracial": `${baseUrl}/categories/interracial`,
                "BBC (Big Black Cock)": `${baseUrl}/categories/bbc`,
                "Ass-To-Mouth": `${baseUrl}/categories/ass-to-mouth`,
                "Big Tits": `${baseUrl}/categories/big-tits`,
                "Anal": `${baseUrl}/categories/anal`,
                "Amateur": `${baseUrl}/categories/amateur`,
                "Lesbian": `${baseUrl}/categories/lesbian`,
                "Threesome": `${baseUrl}/categories/threesome`
            };
            
            const categoryItems = {};
            
            for (const [categoryName, categoryUrl] of Object.entries(categories)) {
                try {
                    const res = await http_get(categoryUrl, HEADERS);
                    if (res.status === 200 && res.body) {
                        let items = parseCategoryItemsImproved(res.body);
                        if (items.length === 0) items = parseCategoryItems(res.body);
                        if (items.length === 0) items = parseVideoItems(res.body);
                        
                        categoryItems[categoryName] = items.slice(0, 20);
                    } else {
                        categoryItems[categoryName] = [];
                    }
                } catch (e) {
                    console.error(`Error loading ${categoryName}: ${e.message}`);
                    categoryItems[categoryName] = [];
                }
            }
            
            cb({ success: true, data: categoryItems });
            
        } catch (e) {
            console.error("getHome error: " + e.message);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    /**
     * Search for videos
     */
    async function search(query, cb) {
        try {
            const baseUrl = manifest.baseUrl || "https://www.wow.xxx";
            const searchUrl = `${baseUrl}/search/${encodeURIComponent(query)}/relevance/`;
            
            const res = await http_get(searchUrl, HEADERS);
            
            if (res.status !== 200) {
                return cb({ success: false, errorCode: "NETWORK_ERROR", message: "Failed to fetch search results" });
            }
            
            let items = parseCategoryItemsImproved(res.body || "");
            if (items.length === 0) items = parseCategoryItems(res.body || "");
            if (items.length === 0) items = parseVideoItems(res.body || "");
            
            cb({ success: true, data: items });
        } catch (e) {
            console.error("search error: " + e.message);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    /**
     * Load video details
     */
    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            
            if (res.status !== 200) {
                return cb({ success: false, errorCode: "NETWORK_ERROR", message: "Failed to fetch video page" });
            }
            
            const html = res.body || "";
            
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(/\s*-\s*WOW\.XXX$/, '').trim() : "Unknown";
            
            const posterMatch = html.match(/poster='([^']+)'/);
            const posterUrl = posterMatch ? posterMatch[1] : "";
            
            const episode = new Episode({
                name: "Play Video",
                url: url,
                season: 1,
                episode: 1,
                posterUrl: posterUrl
            });
            
            const item = new MultimediaItem({
                title: title,
                url: url,
                posterUrl: posterUrl,
                type: "movie",
                isAdult: true,
                episodes: [episode]
            });
            
            cb({ success: true, data: item });
        } catch (e) {
            console.error("load error: " + e.message);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    function parseVideoStreams(html) {
        const streams = [];
        const sourcePattern = /<source\s+src=['"](https:\/\/www\.wow\.xxx\/get_file\/[^'"]+)['"][^>]*label=['"]([\w\d]+p?)['"][^>]*>/gi;
        
        let match;
        while ((match = sourcePattern.exec(html)) !== null) {
            streams.push({ url: match[1], quality: match[2] });
        }
        return streams;
    }

    async function loadStreams(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            
            if (res.status !== 200) {
                return cb({ success: false, errorCode: "NETWORK_ERROR", message: "Failed to fetch video page" });
            }
            
            const html = res.body || "";
            const streams = [];
            
            const rawStreams = parseVideoStreams(html);
            if (rawStreams.length > 0) {
                rawStreams.forEach(stream => {
                    streams.push(new StreamResult({
                        url: "MAGIC_PROXY_v1" + btoa(stream.url),
                        source: `WOW [${stream.quality}]`,
                        headers: { "Referer": "https://www.wow.xxx/", "User-Agent": HEADERS["User-Agent"] }
                    }));
                });
            }

            const URL_PATTERN = /(https?:)?\/\/[^\s"'`<>]+(?:dood|streamtape|mixdrop|voe|vidhide|emturbovid|fslv2|fslserver|mycloudz|xtreamstream|myvidplay|lapecontent)[^\s"'`<>]+/gi;
            let rawMatches = html.match(URL_PATTERN) || [];
            let uniqueUrls = [...new Set(rawMatches)];
            
            for (let cleanUrl of uniqueUrls) {
                if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
                if (!cleanUrl.includes('ads') && !cleanUrl.includes('disqus') && !cleanUrl.includes('google')) {
                    await loadExtractor(cleanUrl, streams, url);
                }
            }

            if (streams.length === 0) {
                const iframePattern = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
                let match;
                while ((match = iframePattern.exec(html)) !== null) {
                    let iframeUrl = match[1];
                    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
                    if (!iframeUrl.includes('ads') && !iframeUrl.includes('disqus')) {
                        await loadExtractor(iframeUrl, streams, url);
                    }
                }
            }
            
            if (streams.length === 0) {
                streams.push(new StreamResult({ 
                    url: url, 
                    source: "Mirror Fallback",
                    headers: { "Referer": "https://www.wow.xxx/", "User-Agent": HEADERS["User-Agent"] }
                }));
            }
            
            cb({ success: true, data: streams });
        } catch (e) {
            console.error("loadStreams error: " + e.message);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // ===================================================
    // MULTI-SERVER EXTRACTOR ENGINE
    // ===================================================

    async function loadExtractor(url, streams, referer) {
        if (!url) return;
        
        const getDisplayName = (u) => {
            if (u.includes("streamtape.com")) return "Streamtape";
            if (u.includes("mixdrop.co") || u.includes("mixdrop.to")) return "Mixdrop";
            if (u.includes("voe.sx")) return "VOE";
            if (u.includes("dood")) return "DoodStream";
            if (u.includes("vidhide")) return "VidHide";
            try { return new URL(u).hostname.replace("www.", ""); } catch(e) { return "Server"; }
        };

        const serverName = getDisplayName(url);

        if (url.includes("streamtape.com")) {
            await extractStreamtape(url, streams);
        } else if (url.includes("mixdrop.") || url.includes("m1xdrop.")) {
            await extractMixdrop(url, streams);
        } else if (url.includes("voe.sx")) {
            await extractVoe(url, streams);
        } else if (url.includes("dood")) {
            await extractDoodStream(url, streams);
        } else if (url.match(/\.(?:m3u8|mp4)(?:\?.*)?$/i)) {
            streams.push(new StreamResult({ url, source: serverName, headers: { "Referer": url, "User-Agent": HEADERS["User-Agent"] } }));
        }
    }

    async function extractStreamtape(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const match = res.body.match(/robotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*'([^']+)'/);
            if (match) {
                const videoUrl = "https:" + match[1] + match[2].substring(3);
                streams.push(new StreamResult({ url: videoUrl, source: "Streamtape", headers: { "Referer": url, "User-Agent": HEADERS["User-Agent"] } }));
            }
        } catch (e) { console.error("Streamtape Error:", e); }
    }

    async function extractMixdrop(url, streams) {
        try {
            const embedUrl = url.replace("/f/", "/e/");
            const res = await http_get(embedUrl, { ...HEADERS, "Referer": "https://mixdrop.co/" });
            const fileMatch = res.body.match(/wurl\s*=\s*"([^"]+)"/) || res.body.match(/file\s*:\s*"([^"]+)"/);
            if (fileMatch) {
                let videoUrl = fileMatch[1].startsWith("//") ? "https:" + fileMatch[1] : fileMatch[1];
                streams.push(new StreamResult({ url: videoUrl, source: "Mixdrop", headers: { "Referer": embedUrl, "User-Agent": HEADERS["User-Agent"] } }));
            }
        } catch (e) { console.error("Mixdrop Error:", e); }
    }

    async function extractVoe(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            let fileMatch = res.body.match(/'hls':\s*'([A-Za-z0-9+/=]+)'/);
            if (fileMatch) {
                streams.push(new StreamResult({ url: atob(fileMatch[1]), source: "VOE", headers: { "User-Agent": HEADERS["User-Agent"] } }));
            }
        } catch (e) { console.error("VOE Error:", e); }
    }

    async function extractDoodStream(url, streams) {
        try {
            const embedUrl = url.replace("/d/", "/e/");
            const res = await http_get(embedUrl, HEADERS);
            const passMatch = res.body.match(/\/pass_md5\/([^']+)/);
            if (passMatch) {
                const md5Url = `https://dood.to/pass_md5/${passMatch[1]}`;
                const passRes = await http_get(md5Url, { ...HEADERS, "Referer": embedUrl });
                let token = Math.random().toString(36).substring(2, 12);
                const finalUrl = `${passRes.body}${token}?token=${passMatch[1]}&expiry=${Date.now()}`;
                streams.push(new StreamResult({ url: finalUrl, source: "DoodStream", headers: { "Referer": embedUrl, "User-Agent": HEADERS["User-Agent"] } }));
            }
        } catch (e) { console.error("DoodStream Error:", e); }
    }

    // Export functions to SkyStream
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
