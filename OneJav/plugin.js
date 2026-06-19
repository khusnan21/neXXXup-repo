import { http_get } from "../utils/network.js";

const baseUrl = "https://onejav.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "New", list: await getPage(baseUrl + "/new") },
        { title: "Popular", list: await getPage(baseUrl + "/popular") },
        { title: "Random", list: await getPage(baseUrl + "/random") },
        { title: "FC2", list: await getPage(baseUrl + "/tag/FC2") },
        { title: "JavPlayer", list: await getPage(baseUrl + "/tag/JavPlayer") },
        { title: "Actresses", list: await getPage(baseUrl + "/actress") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/search/${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']card["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        // Find title anchor or card-header-title
        let hrefMatch = item.match(/<h5[^>]*class=["'][^"']*(?:title|card-header)[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["']/i) || 
                        item.match(/<a[^>]+href=["']([^"']*\/actress\/[^"']*)["']/i);
                        
        if(!hrefMatch) continue;
        
        let titleMatch = item.match(/<h5[^>]*class=["'][^"']*(?:title|card-header)[^"']*["'][^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/i);
        let title = '';
        if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        } else {
            let pMatch = item.match(/<p[^>]*class=["'][^"']*card-header-title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
            if(pMatch) {
                let ptext = pMatch[1].replace(/<[^>]+>/g, ' ').trim();
                title = ptext;
            }
        }
        
        let imgMatch = item.match(/<img[^>]+data-src=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        let url = hrefMatch[1];
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
    if (url.includes("/actress/")) {
        let titleMatch = res.match(/<title>([\s\S]*?)<\/title>/i);
        if(titleMatch) {
            title = titleMatch[1].split("-")[0].trim();
        }
        
        const episodes = [];
        let items = parseList(res);
        for(let item of items) {
             episodes.push({
                 url: item.url,
                 title: item.title,
                 poster: item.poster
             });
        }
        
        return {
            url: url,
            title: title,
            isMovie: false,
            episodes: episodes
        };
    }
    
    // Movie
    const titleMatch = res.match(/<h5[^>]*class=["'][^"']*(?:title|card-header)[^"']*["'][^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let imgMatch = res.match(/<img[^>]+data-src=["']([^"']+)["']/i) || res.match(/<img[^>]+src=["']([^"']+)["']/i);
    
    let links = [];
    const aTags = res.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
    if (aTags) {
        for(let a of aTags) {
             const m = a.match(/href=["']([^"']+)["']/);
             if(m) {
                 const href = m[1];
                 if(href.startsWith("magnet:") || href.endsWith(".torrent")) {
                     links.push(href);
                 }
             }
        }
    }

    return {
        url: url,
        title: title,
        poster: imgMatch ? imgMatch[1] : '',
        links: links,
        isMovie: true
    };
}

export async function loadLinks(url) {
    if(url.startsWith("magnet:") || url.endsWith(".torrent")) {
        return [{
            url: url.startsWith("/") ? baseUrl + url : url,
            quality: url.startsWith("magnet:") ? "Magnet" : "Torrent",
            isM3U8: false
        }];
    }
    return [];
}
