import { http_get } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

const baseUrl = "https://turkhub.org";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Ana Sayfa", list: await getPage(baseUrl + "/") },
        { title: "Türk İfşalar", list: await getPage(baseUrl + "/turk-ifsalar/") },
        { title: "Türk Porno", list: await getPage(baseUrl + "/turk-porno/") },
        { title: "Türbanlı İfşalar", list: await getPage(baseUrl + "/turbanli-ifsalar/") },
        { title: "Popüler Videolar", list: await getPage(baseUrl + "/populer-videolar/") },
        { title: "En Çok İzlenenler", list: await getPage(baseUrl + "/en-cok-izlenenler/") }
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
    const items = html.split(/class=["']item["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/class=["']title["'][^>]*>\s*<a[^>]*>(.*?)<\/a>/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]+data-src=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
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
