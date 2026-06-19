(function () {
    const BASE_URL = "https://tv1.filmlokal.me";
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": `${BASE_URL}/`
    };

    function parseFilmLokalCards(html) {
        const items = [];
        const seen = new Set();
        
        // Article/div block patterns commonly seen in Dooplay/Wordpress themes for listings:
        const blockPattern = /<(article|div)[^>]*class="[^"]*(?:ml-item|movie|result-item|film|post|item|swiper-slide)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
        let match;
        
        while ((match = blockPattern.exec(html)) !== null) {
            const block = match[2];
            const hrefMatch = block.match(/href="([^"]+)"/i);
            if (!hrefMatch) continue;
            let href = hrefMatch[1];
            if (href.startsWith('/')) href = BASE_URL + href;
            if (!href.startsWith(BASE_URL) || href.includes('/page/')) continue;
            if (seen.has(href)) continue;

            let title = "";
            const titleMatch = block.match(/title="([^"]+)"/i) || block.match(/alt="([^"]+)"/i) || block.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);
            if (titleMatch) {
                title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            } else {
                continue;
            }

            // Cleanup title (similar to FilmLokalParser.kt)
            title = title
                .replace(/^permalink\s+to:\s*/i, '')
                .replace(/^permalink:\s*/i, '')
                .replace(/^watch\s+movie\s*/i, '')
                .replace(/^watch\s*/i, '')
                .replace(/^nonton\s+/i, '')
                .replace(/\s+-\s+filmlokal$/i, '')
                .replace(/\s+subtitle\s+indonesia$/i, ' Sub')
                .replace(/\s+/g, ' ')
                .trim();

            if (!title || title.length < 2) continue;

            let poster = "";
            const posterMatch = block.match(/data-src="([^"]+)"/i) || block.match(/data-original="([^"]+)"/i) || block.match(/src="([^"]+)"/i) || block.match(/data-lazy-src="([^"]+)"/i);
            if (posterMatch) poster = posterMatch[1];
            if (poster && poster.startsWith('/')) poster = BASE_URL + poster;

            // Upscale poster if possible
            if (poster) {
                poster = poster.replace(/-\d+x\d+(?=\.(?:jpg|jpeg|png|webp))/gi, '');
            }

            let type = "movie";
            const low = (href + " " + title).toLowerCase();
            if (low.includes('series') || low.includes('episode') || low.includes('season')) {
                type = "tv";
            }

            seen.add(href);
            items.push(new MultimediaItem({
                title: title,
                url: href,
                posterUrl: poster,
                type: type,
                isAdult: true
            }));
        }

        // Fallback loose parsing for anchors with images
        if (items.length === 0) {
            const loosePattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            while ((match = loosePattern.exec(html)) !== null) {
                const href = match[1];
                const block = match[2];
                if (!href.startsWith(BASE_URL) && !href.startsWith('/')) continue;
                if (href.includes('/category/') || href.includes('/genre/') || href.includes('/tag/') || href.includes('/page/')) continue;
                
                let fullHref = href.startsWith('/') ? BASE_URL + href : href;
                if (seen.has(fullHref)) continue;

                let title = "";
                const titleMatch = block.match(/alt="([^"]+)"/i) || block.match(/title="([^"]+)"/i);
                if (titleMatch) title = titleMatch[1];
                if (!title) {
                    const cleanHref = fullHref.split('/').filter(Boolean).pop();
                    if (cleanHref) title = cleanHref.replace(/-/g, ' ');
                }
                if (!title || title.length < 3) continue;

                let poster = "";
                const imgMatch = block.match(/src="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i);
                if (imgMatch) poster = imgMatch[1];
                if (poster && poster.startsWith('/')) poster = BASE_URL + poster;
                if (poster) {
                    poster = poster.replace(/-\d+x\d+(?=\.(?:jpg|jpeg|png|webp))/gi, '');
                }

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
                "Upload Terbaru": `${BASE_URL}/page/1/`,
                "Best Rating": `${BASE_URL}/best-rating/page/1/`,
                "Film Series": `${BASE_URL}/film-series/page/1/`,
                "Film Semi": `${BASE_URL}/film-semi/page/1/`,
                "ALL JAV": `${BASE_URL}/jav/page/1/`,
                "Subtitle Indonesia": `${BASE_URL}/sub-indo/page/1/`
            };

            const data = {};
            for (const [name, url] of Object.entries(categories)) {
                try {
                    const res = await http_get(url, HEADERS);
                    if (res.status === 200 && res.body) {
                        const items = parseFilmLokalCards(res.body);
                        if (items.length > 0) data[name] = items.slice(0, 24);
                    }
                } catch (e) {
                    console.error(`Error loading category ${name}:`, e);
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
            const url = `${BASE_URL}/page/1/?s=${encoded}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) return cb({ success: false, errorCode: "NETWORK_ERROR" });
            const items = parseFilmLokalCards(res.body || "");
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

            let title = "FilmLokal Video";
            const titleMatch = html.match(/<h1[^>]*class="[^"]*(?:entry-title|title)[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
            if (titleMatch) {
                title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            }

            title = title
                .replace(/^permalink\s+to:\s*/i, '')
                .replace(/^permalink:\s*/i, '')
                .replace(/^watch\s+movie\s*/i, '')
                .replace(/^watch\s*/i, '')
                .replace(/^nonton\s+/i, '')
                .replace(/\s+-\s+filmlokal$/i, '')
                .replace(/\s+subtitle\s+indonesia$/i, ' Sub')
                .replace(/\s+/g, ' ')
                .trim();

            let poster = "";
            const pMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) || html.match(/<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i);
            if (pMatch) poster = pMatch[1];
            if (poster) {
                poster = poster.replace(/-\d+x\d+(?=\.(?:jpg|jpeg|png|webp))/gi, '');
            }

            let plot = "";
            const plotMatch = html.match(/<div class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<p class="sinopsis">([\s\S]*?)<\/p>/i);
            if (plotMatch) {
                plot = plotMatch[1].replace(/<[^>]+>/g, '').trim();
            }

            const tags = [];
            const tagPattern = /<a[^>]*href="[^"]*(?:\/genre\/|\/tag\/|\/category\/)([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let tagMatch;
            while ((tagMatch = tagPattern.exec(html)) !== null) {
                const cleanTag = tagMatch[2].replace(/<[^>]+>/g, '').trim();
                if (cleanTag && !tags.includes(cleanTag) && cleanTag.length < 30) {
                    tags.push(cleanTag);
                }
            }

            const recommendations = parseFilmLokalCards(html).filter(item => item.url !== url);

            // Determine if TV Series by looking for episodes
            const episodes = [];
            const seenEpisodes = new Set();
            const epPattern = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let epMatch;

            while ((epMatch = epPattern.exec(html)) !== null) {
                let epHref = epMatch[1];
                let epText = epMatch[2].replace(/<[^>]+>/g, '').trim();

                if (epHref.startsWith('/')) epHref = BASE_URL + epHref;
                if (!epHref.startsWith(BASE_URL) || epHref === url) continue;

                const epUrlNormalized = epHref.split('#')[0];
                if (seenEpisodes.has(epUrlNormalized)) continue;

                if (epHref.includes('/episode/') || epHref.includes('/season/') || epText.toLowerCase().includes('episode') || epText.toLowerCase().includes('eps')) {
                    seenEpisodes.add(epUrlNormalized);
                    episodes.push(new Episode({
                        name: epText || `Episode ${episodes.length + 1}`,
                        url: epHref,
                        season: 1,
                        episode: episodes.length + 1,
                        posterUrl: poster
                    }));
                }
            }

            // Fallback to single episode if no episodes found or not tv series
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

            // 1. Resolve Dojo / DooPlay AJAX options
            const optionPattern = /<li[^>]*data-post="([^"]+)"[^>]*data-nume="([^"]+)"[^>]*data-type="([^"]+)"/gi;
            let optMatch;
            const ajaxHeaders = {
                ...HEADERS,
                "Accept": "*/*",
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Referer": url
            };

            while ((optMatch = optionPattern.exec(html)) !== null) {
                const post = optMatch[1];
                const nume = optMatch[2];
                const type = optMatch[3];
                if (nume.toLowerCase() === 'trailer') continue;

                try {
                    const postBody = `action=doo_player_ajax&post=${encodeURIComponent(post)}&nume=${encodeURIComponent(nume)}&type=${encodeURIComponent(type)}`;
                    const ajaxRes = await http_post(`${BASE_URL}/wp-admin/admin-ajax.php`, ajaxHeaders, postBody);
                    if (ajaxRes.status === 200 && ajaxRes.body) {
                        const json = JSON.parse(ajaxRes.body);
                        if (json && json.embed_url) {
                            let embedUrl = json.embed_url;
                            if (embedUrl.includes('src="')) {
                                const srcM = embedUrl.match(/src="([^"]+)"/i);
                                if (srcM) embedUrl = srcM[1];
                            }
                            if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
                            if (!resolvedEmbeds.has(embedUrl)) {
                                resolvedEmbeds.add(embedUrl);
                                await loadExtractor(embedUrl, streams);
                            }
                        }
                    }
                } catch (err) {
                    console.error("FilmLokal AJAX Player error:", err);
                }
            }

            // 2. Scan standard iframes in page content
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

            // 3. Match direct video urls in html/scripts
            const matches = html.match(/(https?:)?\/\/[^\s"'`<>\\?#]+?\.(?:m3u8|mp4)(?:\?[^\s"'`<>\\?#]*)?/gi) || [];
            const uniqueMatches = [...new Set(matches)].map(l => l.startsWith('//') ? 'https:' + l : l);

            for (const link of uniqueMatches) {
                if (!link.includes('ads') && !link.includes('google') && !link.includes('facebook') && !link.includes('twitter')) {
                    if (!streams.some(s => s.url === link)) {
                        streams.push(new StreamResult({
                            url: link,
                            source: link.includes('.m3u8') ? "FilmLokal HLS" : "FilmLokal Video",
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
            // Pixeldrain direct API files download URL format
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
