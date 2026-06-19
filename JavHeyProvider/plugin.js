(function () {
    const BASE_URL = "https://javhey.com";
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Referer": `${BASE_URL}/`
    };

    function parseJavHeyCards(html) {
        const items = [];
        const seen = new Set();
        const blockPattern = /<article[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
        let match;
        
        while ((match = blockPattern.exec(html)) !== null) {
            const block = match[1];
            const hrefM = block.match(/href="([^"]+)"/i);
            if (!hrefM) continue;
            let href = hrefM[1];
            if (href.startsWith('/')) href = BASE_URL + href;
            if (seen.has(href)) continue;

            const titleM = block.match(/<h3>\s*<a[^>]*>([\s\S]*?)<\/a>/i) || 
                           block.match(/title="([^"]+)"/i) || 
                           block.match(/alt="([^"]+)"/i);
            let title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : "";
            if (!title) continue;
            title = title.replace("JAV Subtitle Indonesia - ", "").trim();

            let poster = "";
            const posterM = block.match(/src="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i);
            if (posterM) poster = posterM[1];
            if (poster && poster.startsWith('/')) poster = BASE_URL + poster;

            seen.add(href);
            items.push(new MultimediaItem({
                title: title,
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
                "Latest Update": `${BASE_URL}/videos/paling-baru/`,
                "Censored JAV": `${BASE_URL}/category/2/censored/`,
                "Uncensored JAV": `${BASE_URL}/category/31/decensored/`,
                "Most Viewed": `${BASE_URL}/videos/paling-dilihat/`,
                "Top Rating": `${BASE_URL}/videos/top-rating/`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseJavHeyCards(res.body);
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
            const url = `${BASE_URL}/search?s=${encoded}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });
            const items = parseJavHeyCards(res.body || "");
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

            let title = "JavHey Video";
            const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || 
                               html.match(/<meta property="og:title" content="([^"]+)"/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim().replace("JAV Subtitle Indonesia - ", "");

            let poster = "";
            const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i) || 
                          html.match(/<div class="product"[^>]*>[\s\S]*?<img src="([^"]+)"/i);
            if (ogImg) poster = ogImg[1];

            let desc = "";
            const ogDesc = html.match(/<meta name="description" content="([^"]+)"/i) || 
                          html.match(/<p class="video-description">([\s\S]*?)<\/p>/i);
            if (ogDesc) desc = ogDesc[1].replace(/<[^>]+>/g, '').replace("Description: ", "").trim();

            const recommendations = parseJavHeyCards(html).filter(item => item.url !== url);

            const episodes = [
                new Episode({
                    name: "Play Video",
                    url: url,
                    season: 1,
                    episode: 1,
                    posterUrl: poster
                })
            ];

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    type: "movie",
                    isAdult: true,
                    description: desc,
                    recommendations: recommendations.slice(0, 15),
                    episodes: episodes
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
            const resolvedEmbeds = new Set();

            const iframePattern = /<iframe[^>]*(?:src|data-src)="([^"]+)"/gi;
            let iframeMatch;
            while ((iframeMatch = iframePattern.exec(html)) !== null) {
                let iframeSrc = iframeMatch[1];
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                if (!resolvedEmbeds.has(iframeSrc)) {
                    resolvedEmbeds.add(iframeSrc);
                    await loadExtractor(iframeSrc, streams);
                }
            }

            const matches = html.match(/(https?:)?\/\/[^\s"'`<>\\?#]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>\\?#]*)?/gi) || [];
            const uniqueMatches = [...new Set(matches)].map(l => l.startsWith('//') ? 'https:' + l : l);

            for (const link of uniqueMatches) {
                if (!link.includes('ads') && !link.includes('google') && !link.includes('facebook')) {
                    if (!streams.some(s => s.url === link)) {
                        streams.push(new StreamResult({
                            url: link,
                            source: link.includes('.m3u8') ? "HLS Embeded" : "Direct Link",
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
        const low = url.toLowerCase();
        if (low.includes('dood') || low.includes('d0000d')) {
            await extractDoodStream(url, streams);
        } else if (low.includes('streamtape')) {
            await extractStreamtape(url, streams);
        } else if (low.includes('mixdrop')) {
            await extractMixdrop(url, streams);
        } else if (low.includes('voe')) {
            await extractVoe(url, streams);
        } else if (low.includes('pixeldrain')) {
            await extractPixeldrain(url, streams);
        } else if (low.includes('filemoon')) {
            await extractFilemoon(url, streams);
        } else if (low.includes('streamwish')) {
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
        } catch (e) {}
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
        } catch (e) {}
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
        } catch (e) {}
    }

    async function extractVoe(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const fileMatch = res.body.match(/'hls':\s*'([A-Za-z0-9+/=]+)'/);
            if (fileMatch) {
                streams.push(new StreamResult({ url: atob(fileMatch[1]), source: "VOE [HLS]" }));
            }
        } catch (e) {}
    }

    async function extractPixeldrain(url, streams) {
        try {
            const fileId = url.split('/').pop();
            if (fileId) {
                const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
                streams.push(new StreamResult({ url: directUrl, source: "Pixeldrain", headers: { "Referer": "https://pixeldrain.com/" } }));
            }
        } catch (e) {}
    }

    async function extractFilemoon(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const matches = res.body.match(/file\s*:\s*["']([^"']*\.m3u8[^"']*)["']/i);
            if (matches) {
                streams.push(new StreamResult({ url: matches[1], source: "Filemoon [HLS]", headers: { "Referer": url } }));
            }
        } catch (e) {}
    }

    async function extractStreamwish(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const matches = res.body.match(/file\s*:\s*["']([^"']*\.m3u8[^"']*)["']/i);
            if (matches) {
                streams.push(new StreamResult({ url: matches[1], source: "Streamwish [HLS]", headers: { "Referer": url } }));
            }
        } catch (e) {}
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
