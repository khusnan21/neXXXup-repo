
const baseUrl = "https://en.xchina.co";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Censored AV (6853)", list: await getPage(baseUrl + "/videos/series-6395aba3deb74.html") },
        { title: "Model Media (3558)", list: await getPage(baseUrl + "/videos/series-5f904550b8fcc.html") },
        { title: "Uncensored AV (2356)", list: await getPage(baseUrl + "/videos/series-6395ab7fee104.html") },
        { title: "Independent Creators", list: await getPage(baseUrl + "/videos/series-61bf6e439fed6.html") },
        { title: "Pans Videos", list: await getPage(baseUrl + "/videos/series-63963186ae145.html") },
        { title: "TXVLOG", list: await getPage(baseUrl + "/videos/series-61014080dbfde.html") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/videos/keyword-${encodeURIComponent(query)}.html`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']item video["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/class=["']title["'][^>]*>\s*<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/class=["']title["'][^>]*>\s*<a[^>]*>(.*?)<\/a>/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/url\(['"]?(.*?)['"]?\)/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        
        let url = aTag[1];
        if(!url.startsWith("http")) url = baseUrl + url;

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
    const titleMatch = res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
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
    
    const m3u8Match = res.match(/src:\s*['"](https?:\/\/video\.xchina\.download\/m3u8\/.*?\.m3u8.*?)['"]/i);
    if(m3u8Match) {
         return [{
             url: m3u8Match[1],
             quality: "Video",
             isM3U8: true
         }];
    }
    return [];
}
