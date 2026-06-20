
const baseUrl = "https://koreanpornmovie.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/?filter=latest", getHeaders());
    const results = parseList(res);
    return [{ title: "Latest", list: results }];
}

export async function search(query) {
    const url = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/<article[^>]*>/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        const aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<header[^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>/i) || item.match(/title=["']([^"']+)["']/i);
        let imgMatch = item.match(/data-main-thumb=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        if (aTag) {
            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
            let url = aTag[1];
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
    const titleMatch = res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || res.match(/<span[^>]+itemprop=["']name["'][^>]*>(.*?)<\/span>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    const descMatch = res.match(/<div class=["']desc["'][^>]*>([\s\S]*?)<\/div>/i);
    let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "";
    
    let links = [url];
    // iframes
    const iframes = res.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
    if(iframes) {
        links = [];
        for(let iframe of iframes) {
            const m = iframe.match(/src=["']([^"']+)["']/);
            if(m && !m[1].includes("blank")) {
                links.push("iframe:" + m[1]);
            }
        }
        links.push("meta:" + title);
    }

    return {
        url: url,
        title: title,
        description: description,
        links: links,
        isMovie: true
    };
}

export async function loadLinks(url) {
    if(url.startsWith("iframe:")) {
        let embed = url.substring(7);
        if(embed.startsWith("//")) {
            embed = "https:" + embed;
        }
        return await loadExtractor(embed);
    } else if(url.startsWith("meta:")) {
        const title = url.substring(5);
        return [{
            url: `https://koreanporn.stream/${title}.mp4`,
            quality: "MP4",
            isM3U8: false
        }];
    }
    
    // fallback
    const res = await http_get(url, getHeaders());
    const results = [];
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
    
    return results;
}
