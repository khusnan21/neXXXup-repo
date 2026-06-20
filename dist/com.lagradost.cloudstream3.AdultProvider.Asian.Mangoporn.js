
const baseUrl = "https://mangoporn.net";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const res = await http_get(baseUrl + "/movies/page/1", getHeaders());
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
    const items = html.split(/<article[^>]*>/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<h3>(?:<a[^>]*>)?(.*?)<\/a><\/h3>/i) || item.match(/<div class=["']details["'][^>]*>.*?<a[^>]*>(.*?)<\/a>/i);
        let imgMatch = item.match(/data-wpfc-original-src=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        
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
    const titleMatch = res.match(/<div class=["']data["'][^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    const descMatch = res.match(/<div class=["']wp-content["'][^>]*>([\s\S]*?)<\/div>/i);
    let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "";
    
    let links = [];
    const tabs = res.match(/<div id=["']pettabs["'][^>]*>[\s\S]*?<\/ul>/i);
    if(tabs) {
        const aTags = tabs[0].match(/href=["']([^"']+)["']/gi);
        if(aTags) {
            for(let a of aTags) {
                const link = a.match(/href=["']([^"']+)["']/)[1];
                if(link && !link.includes("blank") && link.startsWith("http")) {
                    links.push("tab:" + link);
                }
            }
        }
    }

    if(links.length === 0) links.push(url);

    return {
        url: url,
        title: title,
        description: description,
        links: links,
        isMovie: true
    };
}

export async function loadLinks(url) {
    let target = url;
    if(url.startsWith("tab:")) {
        target = url.substring(4);
    }
    
    if(target.includes("dood") || target.includes("mixdrop") || target.includes("streamwish") || target.includes("streamtape")) {
         return await loadExtractor(target);
    }

    const res = await http_get(target, getHeaders());
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
