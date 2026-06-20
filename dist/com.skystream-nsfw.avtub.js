(function () {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://avpinay.com/"
    };

    const MOBILE_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    function toPagedUrl(url, page) {
        if (page <= 1) return url;
        const parts = url.split("?");
        let base = parts[0];
        if (base.endsWith("/")) base = base.slice(0, -1);
        const query = parts[1] || "";
        return `${base}/page/${page}/${query ? "?" + query : ""}`;
    }

    function parseAVTubCards(html) {
        const items = [];
        const articleRegex = /<article[^>]*class="[^"]*(?:\bthumb-block\b|\bvideo-preview-item\b)[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
        let match;
        while ((match = articleRegex.exec(html)) !== null) {
            const block = match[1];
            const hrefMatch = block.match(/<a[^>]*href="([^"]+)"/i);
            if (!hrefMatch) continue;
            let href = hrefMatch[1];
            if (href.startsWith('/')) href = 'https://avpinay.com' + href;
            if (!href.startsWith('https://avpinay.com') || href === 'https://avpinay.com/' || href.includes('/wp-content/')) continue;

            let title = "";
            const titleAttr = block.match(/title="([^"]+)"/i);
            if (titleAttr) {
                title = titleAttr[1];
            } else {
                const hMatch = block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
                if (hMatch) {
                    title = hMatch[1].replace(/<[^>]+>/g, '').trim();
                } else {
                    const imgAlt = block.match(/<img[^>]*alt="([^"]+)"/i);
                    if (imgAlt) title = imgAlt[1];
                }
            }
            title = title.replace(/\s+/g, ' ').replace(/ - AVPinay/gi, '').replace(/AVPinay/gi, '').trim();
            if (!title) continue;

            let poster = "";
            const posterMatch = block.match(/data-src="([^"]+)"/i) || block.match(/data-original="([^"]+)"/i) || block.match(/data-lazy-src="([^"]+)"/i) || block.match(/src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];
            if (poster && poster.startsWith('/')) poster = 'https://avpinay.com' + poster;

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

    function unpackPacker(p, a, c, k, e, d) {
        while (c--) {
            if (k[c]) {
                p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            }
        }
        return p;
    }

    function unpackAllPacker(html) {
        const packerRegex = /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/gi;
        let match;
        let unpacked = "";
        while ((match = packerRegex.exec(html)) !== null) {
            try {
                const p = match[1];
                const a = parseInt(match[2]);
                const c = parseInt(match[3]);
                const k = match[4].split('|');
                unpacked += "\n" + unpackPacker(p, a, c, k, 0, {}) + "\n";
            } catch (err) {
                console.error("Packer unpack error:", err);
            }
        }
        return unpacked;
    }

    async function getHome(cb) {
        try {
            const baseUrl = "https://avpinay.com";
            const categories = {
                "Vivamax 2026": `${baseUrl}/category/vivamax/2026/?filter=random`,
                "Vivamax 2025": `${baseUrl}/category/vivamax/2025/?filter=random`,
                "Vivamax 2024": `${baseUrl}/category/vivamax/2024/?filter=random`,
                "Vivamax 2023": `${baseUrl}/category/vivamax/2023/?filter=random`,
                "Vivamax 2022": `${baseUrl}/category/vivamax/2022/?filter=random`,
                "Vivamax 2021": `${baseUrl}/category/vivamax/2021/?filter=random`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseAVTubCards(res.body);
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
            const baseUrl = "https://avpinay.com";
            const encoded = encodeURIComponent(query);
            const url = `${baseUrl}/?s=${encoded}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });
            const items = parseAVTubCards(res.body || "");
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
            let title = "";
            const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            title = title.replace(/\s+/g, ' ').replace(/ - AVPinay/gi, '').replace(/AVPinay/gi, '').trim();

            let poster = "";
            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || html.match(/video[^>]*poster="([^"]+)"/i) || html.match(/class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];

            let plot = "";
            const plotMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<meta name="description" content="([^"]+)"/i);
            if (plotMatch) plot = plotMatch[1];

            const tags = [];
            const tagPattern = /<a[^>]*href="[^"]*\/tag\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let tagMatch;
            while ((tagMatch = tagPattern.exec(html)) !== null) {
                const tagName = tagMatch[2].replace(/<[^>]+>/g, '').trim();
                if (tagName && !tags.includes(tagName)) tags.push(tagName);
            }

            const actors = [];
            const actorPattern = /<a[^>]*href="[^"]*(?:\/model\/|\/pornstar\/|\/actor\/)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            let actorMatch;
            while ((actorMatch = actorPattern.exec(html)) !== null) {
                const actorName = actorMatch[1].replace(/<[^>]+>/g, '').trim();
                if (actorName && !actors.includes(actorName)) actors.push(actorName);
            }

            const recommendations = parseAVTubCards(html);

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
                    description: plot, tags, actors, recommendations,
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

            // Find all embed references
            const tagLinks = [];
            const iframePattern = /<iframe[^>]*src="([^"]+)"/gi;
            let m;
            while ((m = iframePattern.exec(html)) !== null) {
                tagLinks.push(m[1]);
            }
            const videoSrcPattern = /<source[^>]*src="([^"]+)"/gi;
            while ((m = videoSrcPattern.exec(html)) !== null) {
                tagLinks.push(m[1]);
            }
            const mediaPattern = /(https?:)?\/\/[^\s"'`<>]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>]*)?/gi;
            while ((m = mediaPattern.exec(html)) !== null) {
                tagLinks.push(m[0]);
            }

            // Remove duplicates and invalid links
            const uniqueLinks = [...new Set(tagLinks)].map(l => l.startsWith('//') ? 'https:' + l : l);

            for (let link of uniqueLinks) {
                if (link.includes('ads') || link.includes('google') || link.includes('analytics')) continue;

                if (link.includes('.m3u8') || link.includes('.mp4')) {
                    const sourceName = link.includes('.m3u8') ? "HLS Stream" : "Direct MP4";
                    streams.push(new StreamResult({
                        url: link,
                        source: `${sourceName}`,
                        headers: { "Referer": "https://avpinay.com/" }
                    }));
                } else if (link.includes('minochinos.com')) {
                    try {
                        const embedRes = await http_get(link, { ...HEADERS, "User-Agent": MOBILE_UA });
                        const embedHtml = embedRes.body || "";
                        const combined = embedHtml + "\n" + unpackAllPacker(embedHtml);
                        const directUrls = combined.match(/(https?:)?\/\/[^\s"'`\\<>]+?\.m3u8(?:\?[^\s"'`\\<>]*)?/gi) || [];
                        const uniqueDirect = [...new Set(directUrls)].map(dl => dl.replace(/\\/g, '').startsWith('//') ? 'https:' + dl.replace(/\\/g, '') : dl.replace(/\\/g, ''));
                        for (const du of uniqueDirect) {
                            streams.push(new StreamResult({
                                url: du,
                                source: "Minochinos HLS",
                                headers: { "Referer": link }
                            }));
                        }
                    } catch (e) {
                        console.error("Minochinos extraction error:", e);
                    }
                } else if (link.includes('ystream.id')) {
                    try {
                        const codeMatch = link.match(/\/e\/([^/?#]+)/);
                        if (codeMatch) {
                            const code = codeMatch[1];
                            const detailsUrl = `https://ystream.id/api/videos/${code}/embed/details`;
                            const detailsRes = await http_get(detailsUrl, {
                                "User-Agent": MOBILE_UA,
                                "Accept": "*/*",
                                "Referer": link,
                                "X-Embed-Origin": "avpinay.com",
                                "X-Embed-Parent": link,
                                "X-Embed-Referer": "https://avpinay.com/"
                            });
                            if (detailsRes.status === 200 && detailsRes.body) {
                                const nestedUrlMatch = detailsRes.body.match(/"embed_frame_url"\s*:\s*"([^"]+)"/);
                                if (nestedUrlMatch) {
                                    const nestedUrl = nestedUrlMatch[1].replace(/\\/g, '');
                                    await loadExtractor(nestedUrl, streams);
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Ystream extraction error:", e);
                    }
                } else {
                    await loadExtractor(link, streams);
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

    // Embed/Extractor fallbacks
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
        } catch (e) { console.error("DoodStream extraction error:", e); }
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
        } catch (e) { console.error("Streamtape extraction error:", e); }
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
        } catch (e) { console.error("Mixdrop extraction error:", e); }
    }

    async function extractVoe(url, streams) {
        try {
            const res = await http_get(url, HEADERS);
            const fileMatch = res.body.match(/'hls':\s*'([A-Za-z0-9+/=]+)'/);
            if (fileMatch) {
                streams.push(new StreamResult({ url: atob(fileMatch[1]), source: "VOE [HLS]" }));
            }
        } catch (e) { console.error("VOE extraction error:", e); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
