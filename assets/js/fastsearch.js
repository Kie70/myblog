import * as params from '@params';

let fuse; // holds our search engine
let resList = document.getElementById('searchResults');
let sInput = document.getElementById('searchInput');
let first, last, current_elem = null
let resultsAvailable = false;

// load our search index
window.onload = function () {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                let data = JSON.parse(xhr.responseText);
                if (data) {
                    // 去重：基于 permalink 去重
                    let uniqueData = [];
                    let seenPermalinks = new Set();
                    
                    for (let item of data) {
                        if (!seenPermalinks.has(item.permalink)) {
                            seenPermalinks.add(item.permalink);
                            uniqueData.push(item);
                        }
                    }
                    
                    // fuse.js options; check fuse.js website for details
                    // 只搜索标题
                    let options = {
                        distance: 100,
                        threshold: 0.4,
                        ignoreLocation: true,
                        minMatchCharLength: 1,
                        findAllMatches: false,
                        keys: [
                            { name: 'title', weight: 1.0 }  // 只搜索标题，权重100%
                        ]
                    };
                    if (params.fuseOpts) {
                        options = {
                            isCaseSensitive: params.fuseOpts.iscasesensitive ?? false,
                            includeScore: params.fuseOpts.includescore ?? false,
                            includeMatches: params.fuseOpts.includematches ?? false,
                            minMatchCharLength: params.fuseOpts.minmatchcharlength ?? 1,
                            shouldSort: params.fuseOpts.shouldsort ?? true,
                            findAllMatches: params.fuseOpts.findallmatches ?? false,
                            // 强制只使用 title 作为搜索键
                            keys: [{ name: 'title', weight: 1.0 }],
                            location: params.fuseOpts.location ?? 0,
                            threshold: params.fuseOpts.threshold ?? 0.4,
                            distance: params.fuseOpts.distance ?? 100,
                            ignoreLocation: params.fuseOpts.ignorelocation ?? true
                        }
                    }
                    fuse = new Fuse(uniqueData, options); // build the index from the json file
                }
            } else {
                console.log(xhr.responseText);
            }
        }
    };
    xhr.open('GET', "../index.json");
    xhr.send();
}

function activeToggle(ae) {
    document.querySelectorAll('.focus').forEach(function (element) {
        // rm focus class
        element.classList.remove("focus")
    });
    if (ae) {
        ae.focus()
        document.activeElement = current_elem = ae;
        ae.parentElement.classList.add("focus")
    } else {
        document.activeElement.parentElement.classList.add("focus")
    }
}

function reset() {
    resultsAvailable = false;
    resList.innerHTML = sInput.value = ''; // clear inputbox and searchResults
    sInput.focus(); // shift focus to input box
}

// execute search as each character is typed
sInput.onkeyup = function (e) {
    // run a search query (for "term") every time a letter is typed
    // in the search box
    if (fuse) {
        let searchTerm = this.value.trim();
        
        // 清空之前的结果
        if (searchTerm.length === 0) {
            resList.innerHTML = '';
            resultsAvailable = false;
            return;
        }
        
        let results;
        results = fuse.search(searchTerm, {limit: 10}); // the actual query being run using fuse.js
        
        // 去重结果
        let seenUrls = new Set();
        let uniqueResults = [];
        for (let result of results) {
            if (!seenUrls.has(result.item.permalink)) {
                seenUrls.add(result.item.permalink);
                uniqueResults.push(result);
            }
        }
        
        if (uniqueResults.length !== 0) {
            // build our html if result exists
            let resultSet = ''; // our results bucket

            for (let item of uniqueResults) {
                let resultItem = item.item;
                let title = resultItem.title || '无标题';
                
                // 只显示标题，不显示摘要
                resultSet += `<li class="post-entry">
                    <header class="entry-header">${title}&nbsp;»</header>
                    <a href="${resultItem.permalink}" aria-label="${title}"></a>
                </li>`;
            }

            resList.innerHTML = resultSet;
            resultsAvailable = true;
            first = resList.firstChild;
            last = resList.lastChild;
        } else {
            resultsAvailable = false;
            resList.innerHTML = '<li class="post-entry"><header class="entry-header">未找到相关文章</header></li>';
        }
    }
}

sInput.addEventListener('search', function (e) {
    // clicked on x
    if (!this.value) reset()
})

// kb bindings
document.onkeydown = function (e) {
    let key = e.key;
    let ae = document.activeElement;

    let inbox = document.getElementById("searchbox").contains(ae)

    if (ae === sInput) {
        let elements = document.getElementsByClassName('focus');
        while (elements.length > 0) {
            elements[0].classList.remove('focus');
        }
    } else if (current_elem) ae = current_elem;

    if (key === "Escape") {
        reset()
    } else if (!resultsAvailable || !inbox) {
        return
    } else if (key === "ArrowDown") {
        e.preventDefault();
        if (ae == sInput) {
            // if the currently focused element is the search input, focus the <a> of first <li>
            activeToggle(resList.firstChild.lastChild);
        } else if (ae.parentElement != last) {
            // if the currently focused element's parent is last, do nothing
            // otherwise select the next search result
            activeToggle(ae.parentElement.nextSibling.lastChild);
        }
    } else if (key === "ArrowUp") {
        e.preventDefault();
        if (ae.parentElement == first) {
            // if the currently focused element is first item, go to input box
            activeToggle(sInput);
        } else if (ae != sInput) {
            // if the currently focused element is input box, do nothing
            // otherwise select the previous search result
            activeToggle(ae.parentElement.previousSibling.lastChild);
        }
    } else if (key === "ArrowRight") {
        ae.click(); // click on active link
    }
}
