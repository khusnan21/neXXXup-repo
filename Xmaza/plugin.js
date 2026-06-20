
const baseUrl = "https://xmaza.net";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Home", list: await getPage(baseUrl + "/page/1") },
        { title: "Ullu", list: await getPage(baseUrl + "/ullu-c14/page/1") },
        { title: "Triflicks", list: await getPage(baseUrl + "/triflicks/page/1") },
        { title: "PrimePlay", list: await getPage(baseUrl + "/primeplay-c1/page/1") },
        { title: "Kooku", list: await getPage(baseUrl + "/kooku/page/1") },
        { title: "Atragii", list: await getPage(baseUrl + "/atragii-c8/page/1") },
        { title: "Rabbit", list: await getPage(baseUrl + "/rabbit/page/1") },
        { title: "Hunters", list: await getPage(baseUrl + "/hunters/page/1") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const videosMatch = html.match(/<div class=["']videos["'][^>]*>([\s\S]*?)<\/div>\s*<nav/i) || html.match(/<div class=["']videos["'][^>]*>([\s\S]+)/i);
    let videosHtml = html;
    if(videosMatch) videosHtml = videosMatch[1];
    
    const items = videosHtml.split(/<a[^>]*href=["'][^"']+["'][^>]*>/i);
    for (let i = 1; i < items.length; i++) {
        // the split removes the <a href> so let's match normally
    }
    
    // Easier way
    const itemRegex = /<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*style=["']background-image:\s*url\(['"]([^'"]+)['"]\)/gi;
    let m;
    while((m = itemRegex.exec(videosHtml)) !== null) {
         let url = m[1];
         let title = m[2];
         let poster = m[3];
         if(!url.startsWith("http")) url = baseUrl + url;
         
         results.push({
             url: url,
             title: title,
             poster: poster
         });
    }
    
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
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
    
    const sourceMatch = res.match(/<video[^>]*id=["']my-video["'][^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i) || res.match(/<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i);
    if(sourceMatch) {
         let videoSource = sourceMatch[1];
         if(!videoSource.startsWith("http")) videoSource = baseUrl + videoSource;
         
         results.push({
             url: videoSource,
             quality: "Video",
             isM3U8: videoSource.includes(".m3u8")
         });
    }
    
    return results;
}
