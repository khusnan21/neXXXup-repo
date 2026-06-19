(function () {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Referer": "https://archivebate.com/"
    };

    function rewriteArchivebatePage(url, page) {
        if (page <= 1) return url;
        const parts = url.split("?");
        const base = parts[0];
        const query = parts[1] || "";
        const params = new URLSearchParams(query);
        params.set("page", page);
        return `${base}?${params.toString()}`;
    }

    function parseArchivebateCards(html) {
        const items = [];
        const itemPattern = /<(section|article|div)[^>]*class="[^"]*(?:video_item|post|card|article)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
        let match;
        while ((match = itemPattern.exec(html)) !== null) {
            const block = match[2];
            const linkMatch = block.match(/<a[^>]*href="([^"]*\/watch\/[^"]*)"/i) || block.match(/<a[^>]*href="([^"]*\/profile\/[^"]*)"/i) || block.match(/<a[^>]*href="([^"]*)"[^>]*rel="bookmark"/i);
            if (!linkMatch) continue;
            let href = linkMatch[1];
            if (href.startsWith('/')) href = 'https://archivebate.com' + href;

            let title = "";
            const titleMatch = block.match(/<h[23][^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i) || block.match(/<div class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || block.match(/<span class="[^"]*username[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            if (!title) {
                const anchorTextMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
                if (anchorTextMatch) title = anchorTextMatch[1].replace(/<[^>]+>/g, '').trim();
            }
            if (!title) {
                title = href.split('/').pop().replace(/-/g, ' ');
            }

            let poster = "";
            const posterMatch = block.match(/poster="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i) || block.match(/src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];
            if (poster && poster.startsWith('/')) poster = 'https://archivebate.com' + poster;

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
            const baseUrl = "https://archivebate.com";
            const categories = {
                "Latest Videos": `${baseUrl}/`,
                "YouTube": `${baseUrl}/platform/eW91dHViZQ==`,
                "Twitch": `${baseUrl}/platform/dHdpdGNo`,
                "OnlyFans": `${baseUrl}/platform/b25seWZhbnM=`,
                "Instagram": `${baseUrl}/platform/aW5zdGFncmFt`,
                "TikTok": `${baseUrl}/platform/dGlktG9r`,
                "BongaCams": `${baseUrl}/platform/Ym9uZ2FjYW1z`,
                "Cam4": `${baseUrl}/platform/Y2FtNA==`,
                "Camsoda": `${baseUrl}/platform/Y2Ftc29kYQ==`,
                "Chaturbate": `${baseUrl}/platform/Y2hhdHVyYmF0ZQ==`,
                "Stripchat": `${baseUrl}/platform/c3RyaXBjaGF0`,
                "Female": `${baseUrl}/gender/ZmVtYWxl`,
                "Couple": `${baseUrl}/gender/Y291cGxl`,
                "Male": `${baseUrl}/gender/bWFsZQ==`,
                "Trans": `${baseUrl}/gender/dHJhbnM=`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseArchivebateCards(res.body);
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
            const baseUrl = "https://archivebate.com";
            const encoded = encodeURIComponent(query);
            // Search profiles first, as fallback search listing
            const searchUrls = [
                `${baseUrl}/search/${encoded}/`,
                `${baseUrl}/?search=${encoded}`,
                `${baseUrl}/?q=${encoded}`
            ];

            let items = [];
            for (const url of searchUrls) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        items = parseArchivebateCards(res.body);
                        if (items.length > 0) break;
                    }
                } catch (e) {
                    console.error(`Search failed for ${url}:`, e);
                }
            }
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
            let title = "Archivebate Video";
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleMatch) title = titleMatch[1].replace(/ - [^-]+$/, '').trim();

            let poster = "";
            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || html.match(/video[^>]*poster="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

            let plot = "";
            const plotMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<meta name="description" content="([^"]+)"/i);
            if (plotMatch) plot = plotMatch[1];

            const tags = [];
            const tagPattern = /<a[^>]*href="[^"]*\/tag\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let tagMatch;
            while ((tagMatch = tagPattern.exec(html)) !== null) {
                tags.push(tagMatch[2].replace(/<[^>]+>/g, '').trim());
            }

            const recommendations = parseArchivebateCards(html);

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

            const matches = html.match(/(https?:)?\/\/[^\s"'`<>\\?#]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>\\?#]*)?/gi) || [];
            const uniqueMatches = [...new Set(matches)].map(l => l.startsWith('//') ? 'https:' + l : l);

            for (const link of uniqueMatches) {
                if (!link.includes('ads') && !link.includes('google')) {
                    streams.push(new StreamResult({
                        url: link,
                        source: link.includes('.m3u8') ? "Archivebate HLS" : "Archivebate Video",
                        headers: { "Referer": url }
                    }));
                }
            }

            // Check for players in iframes:
            const iframeMatches = html.match(/<iframe[^>]*src="([^"]+)"/gi) || [];
            for (const iframe of iframeMatches) {
                const iframeSrcMatch = iframe.match(/src="([^"]+)"/i);
                if (iframeSrcMatch) {
                    let src = iframeSrcMatch[1];
                    if (src.startsWith('//')) src = 'https:' + src;
                    if (src.includes('dood') || src.includes('d0000d') || src.includes('mixdrop') || src.includes('voe') || src.includes('streamtape')) {
                        await loadExtractor(src, streams);
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
