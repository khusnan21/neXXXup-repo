(function () {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.doeda.com/"
    };

    function parseDoedaOrijinalCards(html) {
        const items = [];
        const itemPattern = /<div[^>]*class="[^"]*item-video[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let match;
        while ((match = itemPattern.exec(html)) !== null) {
            const block = match[1];
            const anchorMatch = block.match(/<a[^>]*class="[^"]*clip-link[^"]*"[^>]*href="([^"]+)"/i) || block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*clip-link[^"]*"/i);
            if (!anchorMatch) continue;
            let href = anchorMatch[1];
            if (href.startsWith('/')) href = 'https://www.doeda.com' + href;

            let title = "Doeda Video";
            const titleAttr = anchorMatch[0].match(/title="([^"]+)"/i) || block.match(/alt="([^"]+)"/i);
            if (titleAttr) title = titleAttr[1];

            let poster = "";
            const posterMatch = block.match(/src="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i) || block.match(/<img[^>]*src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];
            if (poster && poster.startsWith('/')) poster = 'https://www.doeda.com' + poster;

            items.push(new MultimediaItem({
                title: title.trim(),
                url: href + "|" + poster,
                posterUrl: poster,
                type: "movie",
                isAdult: true
            }));
        }
        return items;
    }

    async function getHome(cb) {
        try {
            const baseUrl = "https://www.doeda.com";
            const categories = {
                "Tüm Videolar": `${baseUrl}/eda`,
                "Üvey Anne": `${baseUrl}/kap/anne-1`,
                "Büyük Meme": `${baseUrl}/kap/buyuk-meme-1`,
                "Esmer": `${baseUrl}/kap/esmer`,
                "Milf": `${baseUrl}/kap/milf-1`,
                "Latin": `${baseUrl}/latin`,
                "Amatör": `${baseUrl}/kap/amator`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseDoedaOrijinalCards(res.body);
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
            const baseUrl = "https://www.doeda.com";
            const encoded = encodeURIComponent(query);
            const url = `${baseUrl}/page/1/?s=${encoded}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });
            const items = parseDoedaOrijinalCards(res.body || "");
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(data, cb) {
        try {
            const parts = data.split('|');
            const url = parts[0];
            const poster = parts[1] || "";

            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });

            const html = res.body || "";
            let title = "Doeda Video";
            const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

            let realPoster = poster;
            if (!realPoster) {
                const posterMatch = html.match(/class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i) || html.match(/<meta property="og:image" content="([^"]+)"/i);
                if (posterMatch) realPoster = posterMatch[1];
            }

            let plot = "";
            const plotMatch = html.match(/<div class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (plotMatch) plot = plotMatch[1].replace(/<[^>]+>/g, '').trim();

            const tags = [];
            const tagPattern = /<div id="extras">([\s\S]*?)<\/div>/i;
            const extrasMatch = html.match(tagPattern);
            if (extrasMatch) {
                const extrasHtml = extrasMatch[1];
                const itemTagPattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
                let tagM;
                while ((tagM = itemTagPattern.exec(extrasHtml)) !== null) {
                    tags.push(tagM[1].replace(/<[^>]+>/g, '').trim());
                }
            }

            const recommendations = parseDoedaOrijinalCards(html);

            const episode = new Episode({
                name: "Play Video",
                url: data,
                season: 1,
                episode: 1,
                posterUrl: realPoster
            });

            cb({
                success: true,
                data: new MultimediaItem({
                    title, url: data, posterUrl: realPoster, type: "movie", isAdult: true,
                    description: plot, tags, recommendations,
                    episodes: [episode]
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(data, cb) {
        try {
            const parts = data.split('|');
            const url = parts[0];

            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });

            const html = res.body || "";
            const streams = [];

            const iframeSrcMatch = html.match(/<div[^>]*class="[^"]*(?:screen|fluid-width-video-wrapper)[^"]*"[^>]*>[\s\S]*?<iframe[^>]*src="([^"]+)"/i) || html.match(/<iframe[^>]*src="([^"]+)"/i);

            if (iframeSrcMatch) {
                let iframeSrc = iframeSrcMatch[1];
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;

                const vidMatch = iframeSrc.match(/vid=([^&]+)/);
                const hostMatch = iframeSrc.match(/https?:\/\/[^/]+/);

                if (vidMatch && hostMatch) {
                    const vid = vidMatch[1];
                    const host = hostMatch[0];

                    try {
                        const ajaxUrl = `${host}/player/ajax_sources.php`;
                        const postBody = `vid=${encodeURIComponent(vid)}&alternative=ankacdn&ord=0`;
                        const ajaxRes = await http_post(ajaxUrl, {
                            "User-Agent": HEADERS["User-Agent"],
                            "X-Requested-With": "XMLHttpRequest",
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "Referer": iframeSrc,
                            "Origin": host
                        }, postBody);

                        if (ajaxRes.status === 200 && ajaxRes.body) {
                            const json = JSON.parse(ajaxRes.body);
                            if (json && json.status === "true" && json.source) {
                                for (const src of json.source) {
                                    streams.push(new StreamResult({
                                        url: src.file,
                                        source: `AnkaCDN [${src.label || "Doeda"}]`,
                                        headers: { "Referer": `${host}/` }
                                    }));
                                }
                            }
                        }
                    } catch (e) {
                        console.error("AJAX sources fetch failed:", e);
                    }
                }
            }

            // Fallback direct scan
            const matches = html.match(/(https?:)?\/\/[^\s"'`<>]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>]*)?/gi) || [];
            for (const link of matches) {
                if (!link.includes('ads') && !link.includes('google')) {
                    const fullLink = link.startsWith('//') ? 'https:' + link : link;
                    if (!streams.some(s => s.url === fullLink)) {
                        streams.push(new StreamResult({
                            url: fullLink,
                            source: "Doeda HLS Fallback",
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

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
