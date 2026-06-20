
const baseUrl = "https://oppai.stream";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

const genres = [
    { id: "ahegao", name: "Ahegao" },
    { id: "censored", name: "Censored" },
    { id: "uncensored", name: "Uncensored" },
    { id: "vanilla", name: "Vanilla" },
    { id: "milf", name: "Milf" },
    { id: "ntr", name: "NTR" }
];

export async function getHome() {
    const results = [];
    for(const g of genres) {
         results.push({ title: g.name, list: await getPage(1, g.id) });
    }
    return results;
}

async function getPage(page, genre) {
    const url = `${baseUrl}/actions/search.php?text=&order=recent&page=${page}&limit=35&genres=${genre}&blacklist=&studio=&ibt=0&swa=1`;
    const referer = `${baseUrl}/search?a=recent&p=${page}&t=&g=${genre}&b=&s=`;
    const res = await http_get(url, { ...getHeaders(), "Referer": referer });
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/actions/search.php?text=${encodeURIComponent(query)}&order=recent&page=1&limit=35&genres=&blacklist=&studio=&ibt=0&swa=1`;
    const referer = `${baseUrl}/search?a=recent&p=1&t=${encodeURIComponent(query)}&g=&b=&s=`;
    const res = await http_get(url, { ...getHeaders(), "Referer": referer });
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["'][^"']*in-grid[^"']*["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i) || item.match(/href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        // Find attributes name and ep
        let nameMatch = html.substring(html.indexOf(item) - 100, html.indexOf(item) + 50).match(/name=["']([^"']+)["']/i);
        let epMatch = html.substring(html.indexOf(item) - 100, html.indexOf(item) + 50).match(/ep=["']([^"']+)["']/i);
        
        let nameAttr = "";
        let epAttr = "";
        if(item.includes("name=")) {
             const mName = item.match(/name=["']([^"']+)["']/i);
             if(mName) nameAttr = mName[1];
        }
        if(item.includes("ep=")) {
             const mEp = item.match(/ep=["']([^"']+)["']/i);
             if(mEp) epAttr = mEp[1];
        }
        
        let title = `${nameAttr} ${epAttr}`.trim();
        if(title === "" && nameMatch && epMatch) title = `${nameMatch[1]} ${epMatch[1]}`.trim();

        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+original=["']([^"']+)["']/i) || item.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        
        let url = aTag[1];
        if(!url.startsWith("http")) url = baseUrl + url;

        results.push({
            url: url,
            title: title || "Unknown",
            poster: imgMatch ? imgMatch[1] : ''
        });
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
    
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    let poster = posterMatch ? posterMatch[1] : "";
    
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
    
    // Parse qualities
    const regex = /"(\d+k?)"\s*:\s*"([^"]+)"/g;
    let match;
    while((match = regex.exec(res)) !== null) {
        let quality = match[1];
        let videourl = match[2].replace(/\\\//g, '/').replace(/ /g, '%20');
        results.push({
            url: videourl,
            quality: quality,
            isM3U8: videourl.includes(".m3u8")
        });
    }
    
    // Subtitles
    const subsMatch = res.match(/<track[^>]+src=["']([^"']+)["']/gi);
    if(subsMatch) {
         for(let sub of subsMatch) {
              const srcMatch = sub.match(/src=["']([^"']+)["']/);
              const langMatch = sub.match(/label=["']([^"']+)["']/);
              if(srcMatch) {
                   results.push({
                        url: srcMatch[1],
                        quality: "Subtitle",
                        language: langMatch ? langMatch[1] : "English",
                        isM3U8: false
                   });
              }
         }
    }
    
    return results;
}
