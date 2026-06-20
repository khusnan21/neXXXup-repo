
const baseUrl = "https://sexalarab.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    return [
        { title: "سكس سحاق", list: await getPage(baseUrl + "/category/افلام-سكس-بنات-سحاق/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&is_private=&from=1") },
        { title: "سكس ميلف", list: await getPage(baseUrl + "/category/سكس-ميلف/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&is_private=&from=1") },
        { title: "سكس امهات", list: await getPage(baseUrl + "/category/سكس-امهات/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&is_private=&from=1") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/search/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${encodeURIComponent(query)}&category_ids=&sort_by=&is_private=&from_videos=1`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/class=["']item\s*private["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<strong class=["']title["'][^>]*>(.*?)<\/strong>/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/data-original=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
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
    const titleMatch = res.match(/<div class=["']headline["'][^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
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
    
    const flashvarsMatch = res.match(/flashvars\s*=\s*({[\s\S]*?});/i);
    if (flashvarsMatch) {
         try {
             // Basic JSON-like parsing for flashvars
             let jsonStr = flashvarsMatch[1];
             jsonStr = jsonStr.replace(/'/g, '"');
             // Convert bare keys to quoted keys
             jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
             
             let fvars = JSON.parse(jsonStr);
             
             const urls = [
                {key: 'video_url', qualityKey: 'video_url_text', default: '360p'},
                {key: 'video_alt_url', qualityKey: 'video_alt_url_text', default: '480p'},
                {key: 'video_alt_url2', qualityKey: 'video_alt_url2_text', default: '720p'},
                {key: 'video_alt_url3', qualityKey: 'video_alt_url3_text', default: '1080p'}
             ];
             
             for(let item of urls) {
                  if (fvars[item.key]) {
                      let vurl = fvars[item.key];
                      let quality = fvars[item.qualityKey] || item.default;
                      
                      if (vurl.startsWith('function/0/')) {
                          vurl = vurl.substring(11);
                      }
                      vurl = vurl.replace(/\/+$/, '');
                      
                      if (vurl.startsWith('http')) {
                          let finalUrl = vurl;
                          try {
                               // resolve redirection if any
                               const rRes = await http_get(vurl, { ...getHeaders(), allowRedirects: false });
                               // Our fetch doesn't expose headers easily, assume our http client follows redirects when getting actual video
                          } catch(e) {}
                          
                          results.push({
                              url: finalUrl,
                              quality: quality,
                              isM3U8: finalUrl.includes(".m3u8")
                          });
                      }
                  }
             }
         } catch(e) {}
    }
    
    return results;
}
