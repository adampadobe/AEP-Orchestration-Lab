function cancelAnalysis(projectId) {
    var btn = document.getElementById("cancel-btn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Cancelling...";
    }
    fetch("/analyze/" + projectId + "/cancel", { method: "POST" })
        .catch(function() {});
}

function startAnalysisStream(projectId) {
    var source = new EventSource("/analyze/" + projectId + "/stream");
    var stepList = document.getElementById("step-list");
    var doneActions = document.getElementById("done-actions");
    var errorMsg = document.getElementById("error-msg");
    var errorText = document.getElementById("error-text");
    var cancelSection = document.getElementById("cancel-section");

    source.onmessage = function(event) {
        var data = JSON.parse(event.data);

        if (data.status === "done") {
            source.close();
            if (cancelSection) cancelSection.style.display = "none";
            doneActions.style.display = "block";
            return;
        }

        if (data.status === "error") {
            source.close();
            if (cancelSection) cancelSection.style.display = "none";
            errorText.textContent = data.message;
            errorMsg.style.display = "block";
            return;
        }

        var step = data.step;
        var items = stepList.querySelectorAll(".step-item");

        items.forEach(function(item) {
            var itemStep = parseInt(item.getAttribute("data-step"));

            if (itemStep === step) {
                item.className = "step-item " + data.status;
                var desc = item.querySelector(".step-content p");
                if (desc && data.message) {
                    desc.textContent = data.message;
                }

                if (data.status === "completed") {
                    var icon = item.querySelector(".step-icon");
                    icon.textContent = "\u2713";
                }
            }
        });
    };

    source.onerror = function() {
        source.close();
        setTimeout(function() {
            window.location.reload();
        }, 2000);
    };
}
