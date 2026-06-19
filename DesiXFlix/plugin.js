(function () {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://desixflix.work/"
    };

    function parseDesiXFlixCards(html) {
        const items = [];
        const cardPattern = /<div[^>]*class="[^"]*post-card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let match;
        while ((match = cardPattern.exec(html)) !== null) {
            const block = match[1];
            const hrefMatch = block.match(/<a[^>]*href="([^"]+)"/i);
            if (!hrefMatch) continue;
            let href = hrefMatch[1];
            if (href.startsWith('/')) href = 'https://desixflix.work' + href;

            let title = "DesiXFlix Video";
            const titleAttr = block.match(/title="([^"]+)"/i) || block.match(/alt="([^"]+)"/i);
            if (titleAttr) title = titleAttr[1];

            let poster = "";
            const posterMatch = block.match(/data-src="([^"]+)"/i) || block.match(/src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];
            if (poster && poster.startsWith('/')) poster = 'https://desixflix.work' + poster;

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
            const baseUrl = "https://desixflix.work";
            const categories = {
                "Home": `${baseUrl}`,
                "Exclusives": `${baseUrl}/category/desixflix-exclusives/`,
                "Altbalaji": `${baseUrl}/category/altbalaji/`,
                "Ullu": `${baseUrl}/category/ullu-originals/`,
                "Kooku": `${baseUrl}/category/kooku-originals/`,
                "PrimeShots": `${baseUrl}/category/prime-shots/`,
                "Hotshots": `${baseUrl}/category/hotshots/`,
                "Fliz": `${baseUrl}/category/fliz-movies/`,
                "Rabbit": `${baseUrl}/category/rabbit-original/`,
                "Gazzu": `${baseUrl}/category/gazzu-originals/`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseDesiXFlixCards(res.body);
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
            const baseUrl = "https://desixflix.work";
            const encoded = encodeURIComponent(query);
            const url = `${baseUrl}/?s=${encoded}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });
            const items = parseDesiXFlixCards(res.body || "");
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
            let title = "DesiXFlix Video";
            const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

            let poster = "";
            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

            let plot = "";
            const plotMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
            if (plotMatch) plot = plotMatch[1];

            const tags = [];
            const tagPattern = /<a[^>]*href="[^"]*\/tag\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let tagMatch;
            while ((tagMatch = tagPattern.exec(html)) !== null) {
                tags.push(tagMatch[2].replace(/<[^>]+>/g, '').trim());
            }

            const recommendations = parseDesiXFlixCards(html);

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
                    title, url, posterUrl: poster, type: "movie", isAdult: true,
                    description: plot, tags, recommendations,
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

            // Matches direct m3u8 inside script blocks or page html:
            const m3u8Match = html.match(/file:\s*"(.*?\.m3u8)"/) || html.match(/file:\s*'(.*?\.m3u8)'/);
            if (m3u8Match) {
                streams.push(new StreamResult({
                    url: m3u8Match[1].replace(/\\/g, ''),
                    source: "DesiXFlix HLS",
                    headers: { "Referer": url }
                }));
            }

            // Check iframes
            const iframeMatches = html.match(/<iframe[^>]*src="([^"]+)"/gi) || [];
            for (const iframe of iframeMatches) {
                const srcMatch = iframe.match(/src="([^"]+)"/i);
                if (srcMatch) {
                    let iframeSrc = srcMatch[1];
                    if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                    await loadExtractor(iframeSrc, streams);
                }
            }

            // Match other video sources
            const matches = html.match(/(https?:)?\/\/[^\s"'`<>]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>]*)?/gi) || [];
            for (const link of matches) {
                if (!link.includes('ads') && !link.includes('google')) {
                    const fullLink = link.startsWith('//') ? 'https:' + link : link;
                    if (!streams.some(s => s.url === fullLink)) {
                        streams.push(new StreamResult({
                            url: fullLink,
                            source: fullLink.includes('.m3u8') ? "DesiXFlix HLS Fallback" : "DesiXFlix Video",
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
        } catch (e) { console.error("DoodStream Error:", e); }
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
        } catch (e) { console.error("Streamtape Error:", e); }
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
        } catch (e) { console.error("Mixdrop Error:", e); }
    }

    async function extractVoe(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const fileMatch = res.body.match(/'hls':\s*'([A-Za-z0-9+/=]+)'/);
            if (fileMatch) {
                streams.push(new StreamResult({ url: atob(fileMatch[1]), source: "VOE [HLS]" }));
            }
        } catch (e) { console.error("VOE Error:", e); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
