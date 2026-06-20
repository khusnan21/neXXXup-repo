
const baseUrl = "https://kingbokep.tv";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/page/1/", getHeaders());
    const results = parseList(res);
    return [{ title: "Latest", list: results }];
}

export async function search(query) {
    const url = `${baseUrl}/search/${encodeURIComponent(query)}/page/1/`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["'][^"']*video-card[^"']*["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        const hrefMatch = item.match(/href=["'](https?:\/\/[^"']+\/view\/[^"']+)["']/i) || item.match(/href=["']([^"']+)["']/i);
        const titleMatch = item.match(/title=["']([^"']+)["']/i) || item.match(/<h[23][^>]*>(.*?)<\/h[23]>/i) || item.match(/<span[^>]+video-card-title[^>]*>(.*?)<\/span>/i);
        
        let imgMatch = item.match(/data-src=["']([^"']+)["']/i) || item.match(/src=["']([^"']+)["']/i);
        
        if (hrefMatch && titleMatch) {
            let title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            let url = hrefMatch[1];
            if(!url.startsWith('http')) {
                url = baseUrl + url;
            }
            results.push({
                url: url,
                title: title,
                poster: imgMatch ? imgMatch[1] : ''
            });
        }
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<h1[^>]*>(.*?)<\/h1>/i) || res.match(/<title>(.*?)<\/title>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    return {
        url: url,
        title: title,
        links: [url],
        isMovie: true
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const results = [];
    
    // Check iframes
    const iframes = res.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
    if (iframes) {
        for (const frame of iframes) {
            const srcMatch = frame.match(/src=["']([^"']+)["']/);
            if (srcMatch && !srcMatch[1].includes("blank")) {
                let embed = srcMatch[1];
                if(embed.startsWith("//")) {
                    embed = "https:" + embed;
                }
                const extr = await loadExtractor(embed);
                if (extr) {
                    extr.forEach(e => results.push(e));
                }
            }
        }
    }
    
    // Check video tag
    const videoMatch = res.match(/<video[^>]+src=["']([^"']+)["']/i) || res.match(/<source[^>]+src=["']([^"']+)["']/i);
    if (videoMatch) {
        let vid = videoMatch[1];
        if(!vid.startsWith('http')) vid = baseUrl + vid;
        results.push({
            url: vid,
            quality: "Video",
            isM3U8: vid.includes("m3u8")
        });
    }
    
    return results;
}
