
const baseUrl = "https://www.kopeda.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/page/1", getHeaders());
    const results = parseList(res);
    return [{ title: "Latest", list: results }];
}

export async function search(query) {
    const url = `${baseUrl}/page/1/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']item-video["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        const aTag = item.match(/<a[^>]*class=["']clip-link["'][^>]*>/i);
        if(!aTag) continue;
        
        const hrefMatch = aTag[0].match(/href=["'](https?:\/\/[^"']+)["']/i);
        const titleMatch = aTag[0].match(/title=["']([^"']+)["']/i);
        
        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        if (hrefMatch && titleMatch) {
            let title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            results.push({
                url: hrefMatch[1],
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
    const titleMatch = res.match(/<h1[^>]*>(.*?)<\/h1>/i);
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
    
    // match iframe
    const iframeMatch = res.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if(iframeMatch) {
        const iframeUrl = iframeMatch[1];
        const idMatch = iframeUrl.match(/pornolar\/([^.]+)\.html/i);
        if(idMatch) {
            const videoId = idMatch[1];
            const apiUrl = `https://api.reqcdn.com/url.php?id=${videoId}&siteid=2`;
            const apiRes = await http_get(apiUrl, getHeaders());
            
            const urlRegex = apiRes.match(/"url":"([^"]+)"/);
            if(urlRegex) {
                let videoUrl = urlRegex[1].replace(/\\\//g, '/');
                results.push({
                    url: videoUrl,
                    quality: "Video",
                    isM3U8: videoUrl.includes(".m3u8")
                });
            }
        }
    }
    
    return results;
}
