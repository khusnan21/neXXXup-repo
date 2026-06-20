
const baseUrl = "https://xn--72c9aha0f8ad1l6bi.com"; // url encoded for thai porn

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Home", list: await getPage(baseUrl) },
        { title: "Thai", list: await getPage(baseUrl + "/video_category/%e0%b8%ab%e0%b8%99%e0%b8%b1%e0%b8%87%e0%b9%82%e0%b8%9b%e0%b9%8a%e0%b9%84%e0%b8%97%e0%b8%a2") },
        { title: "Popular", list: await getPage(baseUrl + "/%e0%b8%ab%e0%b8%99%e0%b8%b1%e0%b8%87%e0%b9%82%e0%b8%9b%e0%b9%8a%e0%b8%ae%e0%b8%b4%e0%b8%95") },
        { title: "Leaked", list: await getPage(baseUrl + "/video_category/%e0%b8%84%e0%b8%a5%e0%b8%b4%e0%b8%9b%e0%b8%ab%e0%b8%a5%e0%b8%b8%e0%b8%94") },
        { title: "Clips", list: await getPage(baseUrl + "/video_category/%e0%b8%84%e0%b8%a5%e0%b8%b4%e0%b8%9b%e0%b9%82%e0%b8%9b%e0%b9%8a") },
        { title: "Erotic", list: await getPage(baseUrl + "/video_category/%e0%b8%ab%e0%b8%99%e0%b8%b1%e0%b8%87%e0%b8%ad%e0%b8%b2%e0%b8%a3%e0%b9%8c") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']box-video["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/class=["'][^"']*shockx-title[^"']*["'][^>]*>\s*<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) {
             aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*title=["']/i);
        }
        if(!aTag) continue;
        
        // Try getting title from h2 a
        let titleMatch = item.match(/class=["'][^"']*shockx-title[^"']*["'][^>]*>\s*<a[^>]*>(.*?)<\/a>/i) || item.match(/title=["']([^"']+)["']/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<figure[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        let url = aTag[1];

        results.push({
            url: url,
            title: title,
            poster: imgMatch ? imgMatch[1] : ''
        });
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<h1 class=["']title["'][^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: [url],
        isMovie: true
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const results = [];
    
    const duPhpSrcMatch = res.match(/<iframe[^>]+src=["']([^"']+\/lib\/du\.php[^"']*)["']/i);
    if (duPhpSrcMatch) {
        let duPhpUrl = duPhpSrcMatch[1];
        if(duPhpUrl.startsWith("//")) duPhpUrl = "https:" + duPhpUrl;
        else if(duPhpUrl.startsWith("/")) duPhpUrl = baseUrl + duPhpUrl;
        
        try {
            const duDoc = await http_get(duPhpUrl, { ...getHeaders(), "Referer": url });
            const playerSrcMatch = duDoc.match(/<iframe[^>]+src=["']([^"']*player\.hlsbroadcast\.com[^"']*)["']/i);
            if(playerSrcMatch) {
                 let playerSrc = playerSrcMatch[1];
                 const sParamMatch = playerSrc.match(/[?&]s=([^&]+)/i);
                 if(sParamMatch) {
                      const sParam = sParamMatch[1];
                      const jsonUrl = `https://codeview.hlsbroadcast.com/${sParam}.json`;
                      const jsonRes = await http_get(jsonUrl, { ...getHeaders(), "Referer": playerSrc });
                      const jsonObj = JSON.parse(jsonRes);
                      if(jsonObj.r2_url) {
                           results.push({
                               url: jsonObj.r2_url,
                               quality: "Video",
                               isM3U8: jsonObj.r2_url.includes(".m3u8")
                           });
                      }
                 }
            }
        } catch(e) {}
    }
    
    return results;
}
