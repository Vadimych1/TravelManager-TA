function show_select_activity_dialog() {
    if (document.getElementById("town-select").value.trim() == "") {
        alert("Ошибка: выберите город.")
        return;
    }

    document.querySelector(".select-activity-overlay").style.display = "block";
    document.querySelector('.select-activity-overlay').innerHTML = "";
    document.querySelector('.select-activity-overlay').append(fetch_activities(
        document.getElementById("town-select").value,
    ));
}

function fetch_activities(town) {
    let content = document.createElement("div");
    let close_btn = document.createElement("button");
    close_btn.innerText = "Закрыть";
    content.append(close_btn);

    close_btn.onclick = () => {
        document.querySelector(".select-activity-overlay").style.display = "none";
    }
    
    fetch(`/api/travels/get_activities?town=${town}`).then(async function (resp) {
        let r = await resp.json();

        for (let act of r) {
            let parent = document.createElement("div");
            parent.className = "activity-block";

            let title = document.createElement('h2');
            title.innerText = act.name;
            
            let desc = document.createElement('p');
            desc.innerText = act.description;
            
            parent.append(title);
            parent.append(desc);

            content.append(parent);

            parent.onclick = function () {
                const i = document.createElement("input");
                i.type = "hidden";
                i.id = "activity-"+act.id
                i.name = "activity";
                i.value = act.id;

                document.querySelector("form").append(i)
                document.querySelector(".select-activity-overlay").style.display = "none"; 
                
                const p = document.createElement("div");
                p.className = "view-activity-block";
                const delete_btn = document.createElement("button");
                delete_btn.innerText = "Удалить";
                const title_t = document.createElement("h2");
                title_t.innerText = act.name;
                const desc_t = document.createElement("p");
                desc_t.innerText = act.description;
                const img = document.createElement("img");
                img.src = "/activities/" + act.id + ".png";
                img.alt = "Изображения отсутсвуют";

                p.append(title_t);
                p.append(desc_t);
                p.append(img);
                p.append(delete_btn);

                delete_btn.onclick = function () {
                    p.remove();
                    document.querySelector("#activity-"+act.id).remove();
                }

                document.querySelector(".activities").append(p);
            }
        }
    });

    return content;
}

document.querySelector(".add").addEventListener("click", function () {
    show_select_activity_dialog();``
});