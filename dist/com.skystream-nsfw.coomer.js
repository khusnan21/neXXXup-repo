(function () {
    const manifest = {
        baseUrl: "https://coomer.st"
    };

    const COOMER_HEADERS = {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Referer": "https://coomer.st/",
        "Accept": "text/css"
    };

    async function http_get(url, headers = {}) {
        try {
            const response = await fetch(url, { method: 'GET', headers: headers });
            const body = await response.text();
            return { status: response.status, body: body };
        } catch (e) {
            throw new Error(e.message);
        }
    }

    let cachedCreators = null;
    async function fetchCreators() {
        if (cachedCreators) return cachedCreators;
        try {
            const res = await http_get("https://raw.githubusercontent.com/Kraptor123/Cs-GizliKeyif/refs/heads/master/.github/commer.json", {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            });
            if (res.status === 200) {
                // Parse html entities just in case
                let text = res.body || "[]";
                // Sometimes Jsoup strips outer html, it's already a clean JSON or inside some body tags
                if (text.includes("<body>")) {
                    text = text.match(/<body>([\s\S]*?)<\/body>/i)[1];
                }
                cachedCreators = JSON.parse(text.trim());
                return cachedCreators;
            }
        } catch (err) {
            console.error("Failed to fetch creators:", err.message);
        }
        return [];
    }

    function shuffle(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }

    async function getHome(cb) {
        try {
            const creators = await fetchCreators();
            const shuffledCreators = shuffle([...creators]).slice(0, 40);
            
            const list = shuffledCreators.map(creator => {
                return new MultimediaItem({
                    title: creator.name || creator.id,
                    url: `${manifest.baseUrl}/api/v1/${creator.service}/user/${creator.id}/profile`,
                    posterUrl: `https://img.coomer.st/icons/${creator.service}/${creator.id}`,
                    type: "series",
                    isAdult: true
                });
            });

            cb({
                success: true,
                data: {
                    "Featured Creators": list
                }
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            if (!query) return cb({ success: true, data: [] });
            const creators = await fetchCreators();
            const filtered = creators.filter(c => {
                const name = (c.name || "").toLowerCase();
                const id = (c.id || "").toLowerCase();
                const q = query.toLowerCase();
                return name.includes(q) || id.includes(q);
            }).slice(0, 50);

            const items = filtered.map(creator => {
                return new MultimediaItem({
                    title: creator.name || creator.id,
                    url: `${manifest.baseUrl}/api/v1/${creator.service}/user/${creator.id}/profile`,
                    posterUrl: `https://img.coomer.st/icons/${creator.service}/${creator.id}`,
                    type: "series",
                    isAdult: true
                });
            });

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    function isImage(path) {
        if (!path) return false;
        const lower = path.toLowerCase();
        return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp");
    }

    function isVideo(path) {
        if (!path) return false;
        const lower = path.toLowerCase();
        return lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".avi") || lower.endsWith(".mkv");
    }

    async function load(url, cb) {
        try {
            const profileRes = await http_get(url, COOMER_HEADERS);
            if (profileRes.status !== 200) {
                return cb({ success: false, errorCode: "NETWORK_ERROR" });
            }

            const profileMap = JSON.parse(profileRes.body);
            const name = profileMap.name || "Coomer Creator";
            
            // Extract service and id from profile API URL
            const urlParts = url.split("/");
            // Profile URL structure: https://coomer.st/api/v1/{service}/user/{id}/profile
            const serviceIndex = urlParts.indexOf("v1") + 1;
            const service = urlParts[serviceIndex];
            const id = urlParts[urlParts.indexOf("user") + 1];

            const banner = `https://img.coomer.st/banners/${service}/${id}`;
            const postsUrl = `${manifest.baseUrl}/api/v1/${service}/user/${id}/posts`;
            
            // Fetch first few posts pages
            const allPosts = [];
            try {
                const postsRes = await http_get(postsUrl, COOMER_HEADERS);
                if (postsRes.status === 200) {
                    const firstPagePosts = JSON.parse(postsRes.body);
                    if (Array.isArray(firstPagePosts)) {
                        allPosts.push(...firstPagePosts);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch posts:", err.message);
            }

            const episodes = [];
            const allImages = [];

            // Gather all images from posts to present as a Photo Album folder
            for (const post of allPosts) {
                if (post.file && post.file.path && isImage(post.file.path)) {
                    allImages.push(`https://coomer.st/data${post.file.path}`);
                }
                if (Array.isArray(post.attachments)) {
                    for (const att of post.attachments) {
                        if (att.path && isImage(att.path)) {
                            allImages.push(`https://coomer.st/data${att.path}`);
                        }
                    }
                }
            }

            if (allImages.length > 0) {
                episodes.push(new Episode({
                    name: `Photos Album (${allImages.length} images)`,
                    url: "IMAGES::" + allImages.slice(0, 150).join("||"), // limit to 150 to keep URL length safe
                    season: 1,
                    episode: 1,
                    posterUrl: allImages[0]
                }));
            }

            // Create individual episode for each Video found
            let episodeNumber = 2;
            for (const post of allPosts) {
                const videoUrls = [];
                let thumbnailUrl = null;

                if (post.file && post.file.path) {
                    if (isVideo(post.file.path)) {
                        videoUrls.push(`https://coomer.st/data${post.file.path}`);
                    } else if (isImage(post.file.path)) {
                        thumbnailUrl = `https://img.coomer.st/thumbnail/data${post.file.path}`;
                    }
                }

                if (Array.isArray(post.attachments)) {
                    for (const att of post.attachments) {
                        if (att.path && isVideo(att.path)) {
                            videoUrls.push(`https://coomer.st${att.path}`);
                        }
                    }
                }

                if (videoUrls.length > 0) {
                    const postTitle = post.title || `Video ${episodeNumber - 1}`;
                    episodes.push(new Episode({
                        name: postTitle,
                        url: "VIDEOS::" + videoUrls.join("||"),
                        season: 1,
                        episode: episodeNumber,
                        posterUrl: thumbnailUrl || banner
                    }));
                    episodeNumber++;
                }
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: name,
                    url: url,
                    posterUrl: banner,
                    description: `Creator: ${name}\nService: ${service}\nID: ${id}`,
                    type: "series",
                    isAdult: true,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            if (url.startsWith("IMAGES::")) {
                const imagesStr = url.substring(8);
                const images = imagesStr.split("||");
                // For Photo Album, return images as individual streams / views or direct resources
                const streams = images.map((img, index) => {
                    return new StreamResult({
                        url: img,
                        source: `Photo ${index + 1}`,
                        headers: COOMER_HEADERS
                    });
                });
                return cb({ success: true, data: streams });
            }

            if (url.startsWith("VIDEOS::")) {
                const videosStr = url.substring(8);
                const videos = videosStr.split("||");
                const streams = videos.map((video, index) => {
                    return new StreamResult({
                        url: video,
                        source: `Coomer Stream ${index + 1}`,
                        headers: {
                            "Referer": "https://coomer.st/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }
                    });
                });
                return cb({ success: true, data: streams });
            }

            cb({ success: false, errorCode: "NO_STREAMS" });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
