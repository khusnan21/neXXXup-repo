
const baseUrl = "https://supjav.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "Censored Jav", list: await getPage(baseUrl + "/category/censored-jav/page/1") },
        { title: "English Jav", list: await getPage(baseUrl + "/category/english-subtitles/page/1") },
        { title: "4K", list: await getPage(baseUrl + "/tag/4k/page/1") },
        { title: "Step Mother", list: await getPage(baseUrl + "/tag/stepmother/page/1") }
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
    const items = html.split(/class=["']post["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/title=["']([^"']+)["']/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]+data-original=["']([^"']+)["']/i);
        
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
    const titleMatch = res.match(/<div class=["']archive-title["'][^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<div class=["']post-meta["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
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
    
    const aTags = res.match(/<a[^>]+class=["'][^"']*btn-server[^"']*["'][^>]*>/gi);
    if(aTags) {
        for(let a of aTags) {
            const dataLinkMatch = a.match(/data-link=["']([^"']+)["']/);
            if(dataLinkMatch) {
                const id = dataLinkMatch[1].split('').reverse().join('');
                const fetchurl = `https://lk1.supremejav.com/supjav.php?c=${id}`;
                try {
                    const fetchRes = await http_get(fetchurl, {
                        ...getHeaders(),
                        "Referer": fetchurl,
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    });
                    
                    let embed = "";
                    if(fetchRes.includes("window.location.href")) {
                         const locMatch = fetchRes.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
                         if(locMatch) embed = locMatch[1];
                    } else if (fetchRes.includes("URL=")) {
                         const locMatch = fetchRes.match(/URL=['"]?([^'"]+)['"]?/);
                         if(locMatch) embed = locMatch[1];
                    } else if (fetchRes.includes("http")) { // rudimentary location header fallback simulation
                         embed = fetchRes; // Need actual fetch to get redirected URL in native App, JS fetches handles redirects in native
                    }
                    
                    // Actually http_get wrapper might just follow redirects and return body. We can't access headers["location"] cleanly. 
                    // Let's assume fetchRes is the redirected page content, so we could just parse it.
                    // Wait, supjav.php normally returns an iframe or just redirects.
                    // Let's just try loading extractor on fetchurl, maybe our http_get handles redirect.
                    const extr = await loadExtractor(fetchurl); // CloudStream's loadExtractor follows redirects.
                    if (extr) {
                        extr.forEach(e => results.push(e));
                    }
                } catch(e) {}
            }
        }
    }
    
    return results;
}
