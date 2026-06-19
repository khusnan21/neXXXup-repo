import { http_get } from "../utils/network.js";

const baseUrl = "https://sukebei.nyaa.si";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Latest Sukebei Releases", list: await getPage(baseUrl + "/?f=0&c=0_0&q=&p=1") },
        { title: "Most popular", list: await getPage(baseUrl + "/?f=0&c=0_0&s=seeders&o=desc&q=&p=1") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/?f=0&c=0_0&q=${encodeURIComponent(query)}&p=1`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/<tr[^>]*>/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<td[^>]*colspan=["']2["'][^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i);
        if(!aTag) {
            // fallback
            aTag = item.match(/<td[^>]*colspan=["']2["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/i);
        }
        
        // Exclude comment links
        if(aTag && aTag[1].includes("#comments")) {
            let matches = item.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/gi);
            if(matches) {
                for(let m of matches) {
                    if(!m.includes("#comments")) {
                        aTag = m.match(/href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i);
                        break;
                    }
                }
            }
        }

        if (aTag && !aTag[1].includes("#comments")) {
            let title = aTag[2].replace(/<[^>]+>/g, '').trim();
            let url = aTag[1];
            if(!url.startsWith("http")) url = baseUrl + url;

            results.push({
                url: url,
                title: title,
                poster: "" // Sukebei list has no posters usually
            });
        }
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<div class=["']panel-heading["'][^>]*>\s*<h3 class=["']panel-title["'][^>]*>([\s\S]*?)<\/h3>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<div id=["']torrent-description["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    let magnet = "";
    const magnetMatch = res.match(/<a[^>]+href=["'](magnet:\?[^"']+)["']/i);
    if(magnetMatch) magnet = magnetMatch[1];
    else magnet = url; // Not a magnet? Then fail gracefully in loadLinks
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: [magnet], // pass the magnet URI as the link
        isMovie: true
    };
}

export async function loadLinks(url) {
    if(url.startsWith("magnet:")) {
        const trackers = [
            "http://sukebei.tracker.wf:8888/announce",
            "http://t.overflow.biz:6969/announce",
            "http://tracker.bt4g.com:2095/announce",
            "https://1337.abcvg.info:443/announce",
            "https://tracker1.520.jp:443/announce",
            "udp://208.83.20.20:6969/announce",
            "udp://89.234.156.205:451/announce",
            "udp://93.158.213.92:1337/announce",
            "udp://exodus.desync.com:6969/announce",
            "udp://open.stealth.si:80/announce",
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://tracker.torrent.eu.org:451/announce"
        ];
        
        let magnetUri = url;
        for(let tr of trackers) {
             if (!magnetUri.includes(encodeURIComponent(tr)) && !magnetUri.includes(tr)) {
                 magnetUri += "&tr=" + encodeURIComponent(tr);
             }
        }
        
        return [{
            url: magnetUri,
            quality: "Torrent",
            isM3U8: false
        }];
    }
    return [];
}
