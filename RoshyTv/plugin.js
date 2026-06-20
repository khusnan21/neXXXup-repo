
const baseUrl = "https://roshy.tv";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Subtitles - New", list: await getPage(baseUrl + "/category/english-sub-3/?sort_by=new") },
        { title: "Subtitles - Most Viewed", list: await getPage(baseUrl + "/category/english-sub-3/?sort_by=most_viewed") },
        { title: "Decensored - New", list: await getPage(baseUrl + "/category/decensored-3/?sort_by=new") },
        { title: "Decensored - Most Viewed", list: await getPage(baseUrl + "/category/decensored-3/?sort_by=most_viewed") }
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
    const items = html.split(/<article[^>]*id=["']post/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/title=["']([^"']+)["']/i);
        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
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
    const titleMatch = res.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    let links = [];
    const btnGroups = res.match(/<div class=["']btn-p-groups-items["'][^>]*>([\s\S]*?)<\/div>/i);
    if(btnGroups) {
         const aTags = btnGroups[1].match(/<a[^>]+href=["']([^"']+)["']/gi);
         if(aTags) {
              for(let a of aTags) {
                   const m = a.match(/href=["']([^"']+)["']/);
                   if(m) {
                        links.push("roshy:" + m[1]);
                   }
              }
         }
    }

    if(links.length === 0) links.push("roshy:" + url);

    return {
        url: url,
        title: title,
        poster: poster,
        links: links,
        isMovie: true
    };
}

export async function loadLinks(url) {
    const results = [];
    
    let target = url;
    if(url.startsWith("roshy:")) {
         target = url.substring(6);
    }
    
    const res = await http_get(target, getHeaders());
    const b64Match = res.match(/<script[^>]*src=["'][^"']*base64,c([^"']+)["']/i) || res.match(/<script[^>]*src=["']data-[^"']*base64,c([^"']+)["']/i);
    if(b64Match) {
        try {
             let decoded = base64Decode("c" + b64Match[1]);
             let jsonStr = decoded.substring(decoded.indexOf("pro_player(") + 11, decoded.indexOf(");"));
             let data = JSON.parse(jsonStr);
             if(data.video_url) {
                  let iframeMatch = data.video_url.match(/<iframe[^>]+src=["']([^"']+)["']/i) || data.video_url.match(/<iframe[^>]+data-src=["']([^"']+)["']/i);
                  if(iframeMatch) {
                       let embed = iframeMatch[1];
                       if(embed.startsWith("//")) embed = "https:" + embed;
                       return await loadExtractor(embed);
                  }
             }
        } catch(e) {}
    }
    
    // Fallback iframes
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
