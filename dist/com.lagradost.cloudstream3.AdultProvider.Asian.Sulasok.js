
const baseUrl = "https://sulasok.uno";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Trending", list: await getPage(baseUrl + "/load_more.php?limit=20&filter=best") },
        { title: "Latest", list: await getPage(baseUrl + "/load_more.php?limit=20") },
        { title: "Longest", list: await getPage(baseUrl + "/load_more.php?limit=20&filter=longest") },
        { title: "Random", list: await getPage(baseUrl + "/load_more_random.php?limit=20") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/load_more_search.php?start=0&limit=20&search=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']col["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/class=["'][^"']*video_title[^"']*["'][^>]*>(.*?)<\//i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/url\(['"]?([^'"]+)['"]?\)/i);
        
        let url = aTag[1];
        url = url.replace("watch.php", "video.php");
        if(url.startsWith("//")) url = "https:" + url;
        else if(url.startsWith("/")) url = baseUrl + url;
        else if(!url.startsWith("http")) url = baseUrl + "/" + url;

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
    const titleMatch = res.match(/property=["']og:title["'] content=["']([^"']+)["']/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/property=["']og:image["'] content=["']([^"']+)["']/i);
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
    const results = [];
    const sources = ["vidara", "streamruby"];
    
    for(let source of sources) {
        let playerUrl = url;
        if (playerUrl.match(/([?&])s=[^&]*/)) {
            playerUrl = playerUrl.replace(/([?&])s=[^&]*/, `$1s=${source}`);
        } else {
            const separator = playerUrl.includes("?") ? "&" : "?";
            playerUrl = `${playerUrl}${separator}s=${source}`;
        }
        
        try {
            const res = await http_get(playerUrl, getHeaders());
            const iframeMatch = res.match(/iframe\.src\s*=\s*['"]([^'"]+)['"]/i) || res.match(/<iframe[^>]+src\s*=\s*['"]([^'"]+)['"]/i);
            if (iframeMatch) {
                let src = iframeMatch[1];
                if(src.startsWith("//")) src = "https:" + src;
                const extr = await loadExtractor(src);
                if (extr) {
                    extr.forEach(e => results.push(e));
                }
            }
        } catch(e) {}
    }
    
    return results;
}
