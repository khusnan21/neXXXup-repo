import { http_get } from "../utils/network.js";
import { loadExtractor } from "../utils/extractors.js";

const baseUrl = "https://uncut99.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Home", list: await getPage(baseUrl + "/page/1") },
        { title: "MMS", list: await getPage(baseUrl + "/category/model-mms/page/1") },
        { title: "Amateur", list: await getPage(baseUrl + "/category/indian-amateur-porn/page/1") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/page/1?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/<article class=["'][^"']*post[^"']*["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<a[^>]+title=["']([^"']+)["']/i);
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
    const titleMatch = res.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    const episodes = [{
        url: url,
        title: title,
        poster: poster
    }];

    return {
        url: url,
        title: title,
        poster: poster,
        isMovie: true,
        episodes: episodes
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const embedMatch = res.match(/<meta itemprop=["']embedURL["'] content=["']([^"']+)["']/i);
    if(embedMatch && embedMatch[1].startsWith("http")) {
         return await loadExtractor(embedMatch[1], baseUrl);
    }
    return [];
}
