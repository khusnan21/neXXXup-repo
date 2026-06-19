(function () {
    const BASE_URL = "https://ifsalog4.club";
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": `${BASE_URL}/`
    };

    function parseIfsaLogCards(html) {
        const items = [];
        const seen = new Set();
        
        // Match div.magpal-grid-post
        const blockPattern = /<div[^>]*class="[^"]*magpal-grid-post[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let match;
        
        while ((match = blockPattern.exec(html)) !== null) {
            const block = match[1];
            const hrefMatch = block.match(/href="([^"]+)"/i);
            if (!hrefMatch) continue;
            let href = hrefMatch[1];
            if (href.startsWith('/')) href = BASE_URL + href;
            if (seen.has(href)) continue;

            let title = "";
            const titleMatch = block.match(/title="([^"]+)"/i) || block.match(/alt="([^"]+)"/i) || block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
            if (titleMatch) {
                title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
                // Strip the "to " prefix if present in Dooplay/Magpal themes
                if (title.toLowerCase().startsWith('to ')) {
                    title = title.substring(3).trim();
                }
            }
            if (!title) continue;

            let poster = "";
            const posterMatch = block.match(/src="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];
            if (poster && poster.startsWith('/')) poster = BASE_URL + poster;

            seen.add(href);
            items.push(new MultimediaItem({
                title: title.trim(),
                url: href,
                posterUrl: poster,
                type: "movie",
                isAdult: true
            }));
        }

        return items;
    }

    async function getHome(cb) {
        try {
            const categories = {
                "Ana Sayfa": `${BASE_URL}/`,
                "Z Kuşağı": `${BASE_URL}/category/z-kusagi/`,
                "Türk İfşa": `${BASE_URL}/category/turk-ifsa/`,
                "Üniversiteli": `${BASE_URL}/category/universiteli/`,
                "Genç": `${BASE_URL}/category/genc/`,
                "Türbanlı": `${BASE_URL}/category/turbanli/`,
                "Tango": `${BASE_URL}/category/tango/`,
                "Onlyfans Porno": `${BASE_URL}/category/onlyfans-porno/`,
                "Türbanlı İfşa": `${BASE_URL}/category/turbanli-ifsa/`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseIfsaLogCards(res.body);
                        if (items.length > 0) data[name] = items.slice(0, 20);
                    }
                } catch (e) {
                    console.error(`Error fetching category ${name}:`, e);
                }
            }
            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const encoded = encodeURIComponent(query);
            const url = `${BASE_URL}/?s=${encoded}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });
            const items = parseIfsaLogCards(res.body || "");
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });

            const html = res.body || "";

            let title = "IfsaLog Video";
            const titleMatch = html.match(/<span[^>]*class="[^"]*singular-entry-title-inside[^"]*"[^>]*><a[^>]*>([\s\S]*?)<\/a>/i) || 
                               html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

            let poster = "";
            const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (ogImg) poster = ogImg[1];

            const recommendations = parseIfsaLogCards(html).filter(item => item.url !== url);

            const episode = new Episode({
                name: "Play Video",
                url: url,
                season: 1,
                episode: 1,
                posterUrl: poster
            });

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    type: "movie",
                    isAdult: true,
                    description: "18 Yaş ve Üzeri İçin Uygundur!",
                    tags: ["+18", "IfsaLog"],
                    recommendations: recommendations.slice(0, 15),
                    episodes: [episode]
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });

            const html = res.body || "";
            const streams = [];

            // Try to find video elements, iframes, or separator anchors
            const videoMatch = html.match(/<video[^>]*>[\s\S]*?<source[^>]*src="([^"]+)"/i) || 
                               html.match(/<source[^>]*src="([^"]+)"/i);
            const iframeMatch = html.match(/<iframe[^>]*src="([^"]+)"/i) || 
                                html.match(/div class="[^"]*chs-iframe-container[^"]*"[^>]*><iframe[^>]*src="([^"]+)"/i);
            const anchorSeparatorMatch = html.match(/<div class="separator">[\s\S]*?<a[^>]*href="([^"]+)"/i);

            let videoUrl = "";
            if (videoMatch) videoUrl = videoMatch[1];
            else if (iframeMatch) videoUrl = iframeMatch[1];
            else if (anchorSeparatorMatch) videoUrl = anchorSeparatorMatch[1];

            if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;

            if (videoUrl) {
                if (videoUrl.includes("gundemexpress")) {
                    streams.push(new StreamResult({
                        url: videoUrl,
                        source: "GundemExpress",
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Referer": `${BASE_URL}/`
                        }
                    }));
                } else {
                    await loadExtractor(videoUrl, streams);
                }
            }

            // Fallback direct url extractor matches
            const matches = html.match(/(https?:)?\/\/[^\s"'`<>\\?#]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>\\?#]*)?/gi) || [];
            const uniqueMatches = [...new Set(matches)].map(l => l.startsWith('//') ? 'https:' + l : l);

            for (const link of uniqueMatches) {
                if (!link.includes('ads') && !link.includes('google') && !link.includes('facebook') && !link.includes('twitter')) {
                    if (!streams.some(s => s.url === link)) {
                        streams.push(new StreamResult({
                            url: link,
                            source: link.includes('.m3u8') ? "IfsaLog HLS" : "IfsaLog Video",
                            headers: { "Referer": url }
                        }));
                    }
                }
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadExtractor(url, streams) {
        if (url.includes('dood') || url.includes('d0000d')) {
            await extractDoodStream(url, streams);
        } else if (url.includes('streamtape')) {
            await extractStreamtape(url, streams);
        } else if (url.includes('mixdrop')) {
            await extractMixdrop(url, streams);
        } else if (url.includes('voe')) {
            await extractVoe(url, streams);
        } else if (url.includes('pixeldrain')) {
            await extractPixeldrain(url, streams);
        } else if (url.includes('filemoon')) {
            await extractFilemoon(url, streams);
        } else if (url.includes('streamwish')) {
            await extractStreamwish(url, streams);
        }
    }

    async function extractDoodStream(url, streams) {
        try {
            const embedUrl = url.replace("/d/", "/e/");
            const res = await http_get(embedUrl, HEADERS);
            const passMatch = res.body.match(/\/pass_md5\/([^']+)/);
            if (passMatch) {
                const md5Url = `https://d0000d.com/pass_md5/${passMatch[1]}`;
                const passRes = await http_get(md5Url, { ...HEADERS, "Referer": embedUrl });
                let token = "";
                const randomStr = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                for (let i = 0; i < 10; i++) token += randomStr.charAt(Math.floor(Math.random() * randomStr.length));
                const finalUrl = `${passRes.body}${token}?token=${passMatch[1]}&expiry=${Date.now()}`;
                streams.push(new StreamResult({ url: finalUrl, source: "DoodStream", headers: { "Referer": embedUrl } }));
            }
        } catch (e) {
            console.error("DoodStream Error:", e);
        }
    }

    async function extractStreamtape(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const match = res.body.match(/robotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*'([^']+)'/) || 
                          res.body.match(/get\('botlink'\)\.innerHTML\s*=\s*['"](.*?)['"]/);
            if (match) {
                const videoUrl = match[2] ? ("https:" + match[1] + match[2].substring(3)) : `https:${match[1]}&stream=1`;
                streams.push(new StreamResult({ url: videoUrl, source: "Streamtape", headers: { "Referer": url } }));
            }
        } catch (e) {
            console.error("Streamtape Error:", e);
        }
    }

    async function extractMixdrop(url, streams) {
        try {
            const embedUrl = url.replace("/f/", "/e/");
            const res = await http_get(embedUrl, { ...HEADERS, "Referer": "https://mixdrop.co/" });
            const fileMatch = res.body.match(/wurl\s*=\s*"([^"]+)"/) || res.body.match(/file\s*:\s*"([^"]+)"/);
            if (fileMatch) {
                const videoUrl = fileMatch[1].startsWith("//") ? "https:" + fileMatch[1] : fileMatch[1];
                streams.push(new StreamResult({ url: videoUrl, source: "Mixdrop", headers: { "Referer": embedUrl } }));
            }
        } catch (e) {
            console.error("Mixdrop Error:", e);
        }
    }

    async function extractVoe(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const fileMatch = res.body.match(/'hls':\s*'([A-Za-z0-9+/=]+)'/);
            if (fileMatch) {
                streams.push(new StreamResult({ url: atob(fileMatch[1]), source: "VOE [HLS]" }));
            }
        } catch (e) {
            console.error("VOE Error:", e);
        }
    }

    async function extractPixeldrain(url, streams) {
        try {
            const fileId = url.split('/').pop();
            if (fileId) {
                const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
                streams.push(new StreamResult({ url: directUrl, source: "Pixeldrain", headers: { "Referer": "https://pixeldrain.com/" } }));
            }
        } catch (e) {
            console.error("Pixeldrain Error:", e);
        }
    }

    async function extractFilemoon(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const matches = res.body.match(/file\s*:\s*["']([^"']*\.m3u8[^"']*)["']/i);
            if (matches) {
                streams.push(new StreamResult({ url: matches[1], source: "Filemoon [HLS]", headers: { "Referer": url } }));
            }
        } catch (e) {
            console.error("Filemoon Error:", e);
        }
    }

    async function extractStreamwish(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const matches = res.body.match(/file\s*:\s*["']([^"']*\.m3u8[^"']*)["']/i);
            if (matches) {
                streams.push(new StreamResult({ url: matches[1], source: "Streamwish [HLS]", headers: { "Referer": url } }));
            }
        } catch (e) {
            console.error("Streamwish Error:", e);
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
