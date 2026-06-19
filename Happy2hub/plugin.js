(function () {
    const BASE_URL = "https://happy2hub.eu";
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": `${BASE_URL}/`
    };

    function parseHappy2hubCards(html) {
        const items = [];
        const seen = new Set();
        
        // Match article blocks or div blocks containing entries or card classes
        const blockPattern = /<(article|div)[^>]*class="[^"]*(?:post|entry-card|item|column|card|content-wrap)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
        let match;
        
        while ((match = blockPattern.exec(html)) !== null) {
            const block = match[2];
            const anchorM = block.match(/<h[234][^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*(?:title|entry-title)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
            if (!anchorM) continue;
            let href = anchorM[1];
            if (href.startsWith('/')) href = BASE_URL + href;
            if (!href.startsWith(BASE_URL) || href.includes('/tag/') || href.includes('/category/') || href.includes('/page/')) continue;
            if (seen.has(href)) continue;

            let title = anchorM[2].replace(/<[^>]+>/g, '').trim();
            if (!title) {
                const imgAltM = block.match(/<img[^>]*alt="([^"]+)"/i);
                if (imgAltM) title = imgAltM[1];
            }
            if (!title) continue;

            title = title
                .replace(/\s+-\s+Happy2hub.*$/i, '')
                .replace(/\s+Watch Online.*$/i, '')
                .replace(/\s+Download.*$/i, '')
                .replace(/\s+/g, ' ')
                .trim();

            let poster = "";
            const posterM = block.match(/data-src="([^"]+)"/i) || block.match(/data-lazy-src="([^"]+)"/i) || block.match(/src="([^"]+)"/i);
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

        if (items.length === 0) {
            const loosePattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            while ((match = loosePattern.exec(html)) !== null) {
                const href = match[1];
                const block = match[2];
                if (!href.startsWith(BASE_URL) && !href.startsWith('/')) continue;
                if (href.includes('/tag/') || href.includes('/category/') || href.includes('/page/')) continue;

                let fullHref = href.startsWith('/') ? BASE_URL + href : href;
                if (seen.has(fullHref)) continue;

                let title = "";
                const titleM = block.match(/alt="([^"]+)"/i) || block.match(/title="([^"]+)"/i);
                if (titleM) title = titleM[1];
                if (!title) {
                    const cleanHref = fullHref.split('/').filter(Boolean).pop();
                    if (cleanHref) title = cleanHref.replace(/-/g, ' ');
                }
                if (!title || title.length < 3) continue;

                let poster = "";
                const imgM = block.match(/src="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i);
                if (imgM) poster = imgM[1];
                if (poster && poster.startsWith('/')) poster = BASE_URL + poster;

                seen.add(fullHref);
                items.push(new MultimediaItem({
                    title: title.trim(),
                    url: fullHref,
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
                "Terbaru": BASE_URL,
                "Primeplay": `${BASE_URL}/tag/primeplay-watch-online/`,
                "Altt": `${BASE_URL}/tag/altt-watch-online/`,
                "All Videos": `${BASE_URL}/tag/18/`,
                "Web Series": `${BASE_URL}/category/web-series/`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseHappy2hubCards(res.body);
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
            const items = parseHappy2hubCards(res.body || "");
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

            let title = "Happy2hub Video";
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

            title = title
                .replace(/\s+-\s+Happy2hub.*$/i, '')
                .replace(/\s+Watch Online.*$/i, '')
                .replace(/\s+Download.*$/i, '')
                .replace(/\s+/g, ' ')
                .trim();

            let poster = "";
            const posterM = html.match(/<meta property="og:image" content="([^"]+)"/i) || html.match(/<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i);
            if (posterM) poster = posterM[1];

            let plot = "";
            const plotM = html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<div class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (plotM) plot = plotM[1].replace(/<[^>]+>/g, '').trim();

            const tags = [];
            const tagPattern = /<a[^>]*href="[^"]*(?:\/tag\/|\/category\/)([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let tagMatch;
            while ((tagMatch = tagPattern.exec(html)) !== null) {
                const tagText = tagMatch[2].replace(/<[^>]+>/g, '').trim();
                if (tagText && !tags.includes(tagText) && tagText.length < 30) {
                    tags.push(tagText);
                }
            }

            const recommendations = parseHappy2hubCards(html).filter(item => item.url !== url);

            const episodes = [];
            const seenEpisodes = new Set();
            const epPattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let epMatch;

            while ((epMatch = epPattern.exec(html)) !== null) {
                let epUrl = epMatch[1];
                let epText = epMatch[2].replace(/<[^>]+>/g, '').trim();

                if (epUrl.startsWith('/')) epUrl = BASE_URL + epUrl;
                if (!epUrl.startsWith(BASE_URL) || epUrl === url) continue;

                const epUrlNormalized = epUrl.split('#')[0];
                if (seenEpisodes.has(epUrlNormalized)) continue;

                if (epUrl.includes('/episode/') || epText.toLowerCase().includes('episode') || epText.toLowerCase().includes('eps')) {
                    seenEpisodes.add(epUrlNormalized);
                    episodes.push(new Episode({
                        name: epText || `Episode ${episodes.length + 1}`,
                        url: epUrl,
                        season: 1,
                        episode: episodes.length + 1,
                        posterUrl: poster
                    }));
                }
            }

            if (episodes.length === 0) {
                episodes.push(new Episode({
                    name: "Play Video",
                    url: url,
                    season: 1,
                    episode: 1,
                    posterUrl: poster
                }));
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    type: episodes.length > 1 ? "tv" : "movie",
                    isAdult: true,
                    description: plot,
                    tags: tags,
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

            // 1. Scan standard iframes
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

            // 2. Scan a tags for extractor candidates
            const aPattern = /<a[^>]*href="([^"]+)"/gi;
            let aMatch;
            while ((aMatch = aPattern.exec(html)) !== null) {
                let link = aMatch[1];
                if (link.startsWith('//')) link = 'https:' + link;
                if (isPlayableUrl(link) && !resolvedEmbeds.has(link)) {
                    resolvedEmbeds.add(link);
                    await loadExtractor(link, streams);
                }
            }

            // 3. Match direct media files in raw body
            const matches = html.match(/(https?:)?\/\/[^\s"'`<>\\?#]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>\\?#]*)?/gi) || [];
            const uniqueMatches = [...new Set(matches)].map(l => l.startsWith('//') ? 'https:' + l : l);

            for (const link of uniqueMatches) {
                if (!link.includes('ads') && !link.includes('google') && !link.includes('facebook') && !link.includes('twitter')) {
                    if (!streams.some(s => s.url === link)) {
                        streams.push(new StreamResult({
                            url: link,
                            source: link.includes('.m3u8') ? "Happy2hub HLS" : "Happy2hub Video",
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

    function isPlayableUrl(url) {
        const low = url.toLowerCase();
        return low.includes('.m3u8') || low.includes('.mp4') || low.includes('voe.') || low.includes('pixeldrain') ||
            low.includes('filemoon') || low.includes('streamtape') || low.includes('dood') || low.includes('mixdrop') ||
            low.includes('streamwish') || low.includes('vidhide') || low.includes('vidoza') || low.includes('luluvdo') ||
            low.includes('dailymotion');
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
