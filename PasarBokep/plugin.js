import { http_get } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

const baseUrl = "https://pasarbokep.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const list1 = await getPage(baseUrl + "/category/bokep-indo/");
    const list2 = await getPage(baseUrl + "/category/bokep-jilbab/");
    return [
        { title: "Bokep Indo", list: list1 },
        { title: "Bokep Jilbab", list: list2 }
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
    const items = html.split(/<article[^>]*>/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i) || item.match(/href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        // Exclude blocked categories/stories
        if(aTag[1].includes("/cerita") || aTag[1].includes("/komik") || aTag[1].includes("/category/")) {
             continue;
        }

        let titleMatch = item.match(/<h[23][^>]*>(?:<a[^>]*>)?(.*?)(?:<\/a>)?<\/h[23]>/i) || item.match(/title=["']([^"']+)["']/i);
        let imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<img[^>]+data-src=["']([^"']+)["']/i);
        
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
    
    // Check source tags
    const sources = res.match(/<source[^>]+src=["']([^"']+)["']/gi);
    if(sources) {
        for(let s of sources) {
            const srcMatch = s.match(/src=["']([^"']+)["']/);
            if(srcMatch) {
                 results.push({
                      url: srcMatch[1].startsWith("//") ? "https:" + srcMatch[1] : srcMatch[1],
                      quality: "Video",
                      isM3U8: srcMatch[1].includes(".m3u8")
                 });
            }
        }
    }
    
    return results;
}
