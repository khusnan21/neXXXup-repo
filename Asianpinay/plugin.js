(function () {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://asianpinay.com/"
    };

    function parseAsianpinayCards(html) {
        const items = [];
        const blockPattern = /<div[^>]*class="[^"]*video-block[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let match;
        while ((match = blockPattern.exec(html)) !== null) {
            const block = match[1];
            const hrefMatch = block.match(/<a[^>]*class="[^"]*thumb[^"]*"[^>]*href="([^"]+)"/i);
            if (!hrefMatch) continue;
            let href = hrefMatch[1];
            if (href.startsWith('/')) href = 'https://asianpinay.com' + href;

            let title = "Unknown";
            const titleSpanMatch = block.match(/<span>([\s\S]*?)<\/span>/i);
            if (titleSpanMatch) {
                title = titleSpanMatch[1].replace(/<[^>]+>/g, '').trim();
            }
            title = title.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

            let poster = "";
            const posterMatch = block.match(/data-src="([^"]+)"/i) || block.match(/src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];
            if (poster && poster.startsWith('/')) poster = 'https://asianpinay.com' + poster;

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
            const baseUrl = "https://asianpinay.com";
            const categories = {
                "Latest": `${baseUrl}/?filter=latest`,
                "Full Movies": `${baseUrl}/category/sexy-movies`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseAsianpinayCards(res.body);
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
            const baseUrl = "https://asianpinay.com";
            const encoded = encodeURIComponent(query);
            const url = `${baseUrl}/?s=${encoded}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });
            const items = parseAsianpinayCards(res.body || "");
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
            let title = "AsianPinay Video";
            const titleMatch = html.match(/<section[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

            let poster = "";
            const posterMatch = html.match(/property=['"]og:image['"]\s*content=['"]([^'"]+)['"]/i) || html.match(/content=['"]([^'"]+)['"]\s*property=['"]og:image['"]/i);
            if (posterMatch) poster = posterMatch[1];

            const tags = [];
            const catBlock = html.match(/Categor(?:y|ies):[\s\S]*?<\/div>/i);
            if (catBlock) {
                const individualTags = catBlock[0].match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || [];
                for (const tagTag of individualTags) {
                    tags.push(tagTag.replace(/<[^>]+>/g, '').trim());
                }
            }

            const actors = [];
            const modelsBlock = html.match(/Models:[\s\S]*?<\/div>/i);
            if (modelsBlock) {
                const individualActors = modelsBlock[0].match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || [];
                for (const actTag of individualActors) {
                    actors.push(actTag.replace(/<[^>]+>/g, '').trim());
                }
            }

            let description = "";
            const descMatch = html.match(/<div class="[^"]*video-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            if (descMatch) {
                description = descMatch[1].replace(/<[^>]+>/g, '').trim();
            }

            const recommendations = parseAsianpinayCards(html);

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
                    description, tags, actors, recommendations,
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

            const embedUrlMatch = html.match(/meta\[itemprop=embedURL\][^>]*content="([^"]+)"/i) || 
                                   html.match(/<meta[^>]*itemprop="embedURL"[^>]*content="([^"]+)"/i) ||
                                   html.match(/<meta[^>]*content="([^"]+)"[^>]*itemprop="embedURL"/i);
            if (embedUrlMatch) {
                const embedUrl = embedUrlMatch[1];
                const embedRes = await http_get(embedUrl, { ...HEADERS, "Referer": "https://asianpinay.com/" });
                const embedHtml = embedRes.body || "";

                const videoIdMatch = embedHtml.match(/video_id\s*=\s*(['"`])(\w+)\1;/);
                const m3u8LoaderMatch = embedHtml.match(/m3u8_loader_url\s*=\s*(['"`])([^'"`]+)\1;/);

                if (videoIdMatch && m3u8LoaderMatch) {
                    const videoId = videoIdMatch[2];
                    const m3u8Loader = m3u8LoaderMatch[2];
                    const videoUrl = m3u8Loader + videoId;

                    streams.push(new StreamResult({
                        url: videoUrl,
                        source: "Asianpinay HLS",
                        headers: { "Referer": "https://asianpinay.com/" }
                    }));
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
