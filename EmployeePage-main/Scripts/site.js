window.DevAV = (function() { 
    var updateTimerID = -1;
    var updateTimeout = 300;
    var searchBoxTimer = -1;
    var cardClassName = "dvCard";
    var cardViewFocusClassName = "focusCard";
    var pendingCallbacks = { };


    var callbackHelper = (function() {
        var callbackControlQueue = [],
            currentCallbackControl = null;

        function doCallback(callbackControl, args, sender, beforeCallback, afterCallback) {
            if (!currentCallbackControl) {
                currentCallbackControl = callbackControl;
                if(typeof(detailsCallbackPanel) !== "undefined" && callbackControl == mainCallbackPanel)
                    detailsCallbackPanel.cpSkipUpdateDetails = true;
                if(!callbackControl.cpHasEndCallbackHandler) {
                    callbackControl.EndCallback.AddHandler(onEndCallback);
                    callbackControl.cpHasEndCallbackHandler = true;
                    callbackControl.cpAfterCallback = afterCallback;
                }
                if(beforeCallback)
                    beforeCallback();
                callbackControl.PerformCallback(args);
            } else
                placeInQueue(callbackControl.name, args, getSenderId(sender));
        };
        function getSenderId(senderObject) {
            if (senderObject.constructor === String)
                return senderObject;
            return senderObject.name || senderObject.id;
        };
        function placeInQueue(callbackControlName, args, sender) {
            var queue = callbackControlQueue;
            for (var i = 0; i < queue.length; i++) {
                if (queue[i].controlName == callbackControlName && queue[i].sender == sender) {
                    queue[i].args = args;
                    return;
                }
            }
            queue.push({ controlName: callbackControlName, args: args, sender: sender });
        };
        function onEndCallback(sender) {
            var queueItem;
            var queuedControl;

            do {
                queueItem = callbackControlQueue.shift();
                queuedControl = queueItem ? getControlInstance(queueItem.controlName) : null;
            } while(!queuedControl && callbackControlQueue.length > 0);

            if(!queuedControl || queuedControl != sender) {
                sender.EndCallback.RemoveHandler(onEndCallback);
                sender.cpHasEndCallbackHandler = false;
                if(sender.cpAfterCallback)
                    sender.cpAfterCallback();
            }
            
            currentCallbackControl = null;
            if(queuedControl)
                doCallback(queuedControl, queueItem.args, queueItem.sender);
        }
        function getControlInstance(name) {
            var controls = ASPx.GetControlCollection().GetControlsByPredicate(function(c) {return c.name === name});
            return controls && controls.length > 0 ? controls[0] : null;
        }
        return {
            DoCallback: doCallback
        };
    })();

    function updateDetailInfo(sender) { // TODO use one method to create timer
        if(detailsCallbackPanel.cpSkipUpdateDetails) {
            detailsCallbackPanel.cpSkipUpdateDetails = false;
            return;
        }
        if(updateTimerID > -1)
            window.clearTimeout(updateTimerID);
        updateTimerID = window.setTimeout(function() {
            window.clearTimeout(updateTimerID);
            callbackHelper.DoCallback(detailsCallbackPanel, "", sender);
        }, updateTimeout);
    };
    function addTask(employeeID, sender) {
        taskEditPopup.cpTaskID = null;

        employeeID = employeeID ? employeeID.toString() : "";
        performTaskCommand("New", employeeID, sender);
    }
    function editTask(id, sender) {
        performTaskCommand("Edit", id, sender);
    };
    function performTaskCommand(commandName, args, sender) {
        showClearedPopup(taskEditPopup);
        callbackHelper.DoCallback(taskEditPopup, commandName + "|" + args, sender);
    };
    function deleteTask(id, sender) {
        if(checkReadOnlyMode())
            return;
        if(confirm("Remove task?"))
            callbackHelper.DoCallback(mainCallbackPanel, serializeArgs(["DeleteEntry", id]), sender);
    };
    function cardView_Init(s, e) {
        ASPxClientUtils.AttachEventToElement(s.GetMainElement(), "click", function(evt) {
            var cardID = getCardID(ASPxClientUtils.GetEventSource(evt));
            if(cardID)
                selectCard(cardID, s);
        });
        if(s.cpSelectedItemID)
            selectCard(s.cpSelectedItemID, s);
    };
    function cardView_EndCallback(s, e) {
        if(s.cpSelectedItemID)
            selectCard(s.cpSelectedItemID, s);
    };

    function selectCard(id, sender) {
        var card = document.getElementById(id);
        if(!card || card.className.indexOf(cardViewFocusClassName) > -1) 
            return;

        var prevSelectedCard = document.getElementById(hiddenField.Get("ID"));
        if(prevSelectedCard)
            prevSelectedCard.className = ASPxClientUtils.Trim(prevSelectedCard.className.replace(cardViewFocusClassName, ""));

        card.className += " " + cardViewFocusClassName;
        hiddenField.Set("ID", id);
        
        var updateDetails = page === employeePage; //TODO add flag to the page 
        if(updateDetails)
            callbackHelper.DoCallback(detailsCallbackPanel, "", sender);
    };
    function getCardID(element) {
        while(element && element.tagName !== "BODY") {
            if(element.className && element.className.indexOf(cardClassName) > -1)
                return element.id;
            element = element.parentNode;
        }
        return null;
    };

    function employeeSaveButton_Click(s, e) {
        var commandName = employeeEditPopup.cpEmployeeID ? "Edit" : "New";
        saveEditForm(employeeEditPopup, serializeArgs([ commandName, employeeEditPopup.cpEmployeeID ]));
    };
    function employeeCancelButton_Click(s, e) {
        employeeEditPopup.Hide();
    };
    function evaluationSaveButton_Click(s, e) {
        saveEditForm(evaluationEditPopup, serializeArgs([ evaluationEditPopup.cpEvaluationID ]), true);
    };
    function evaluationCancelButton_Click(s, e) {
        evaluationEditPopup.Hide();
    };
    function taskSaveButton_Click(s, e) {
        var commandName = taskEditPopup.cpTaskID ? "Edit" : "New";
        saveEditForm(taskEditPopup, serializeArgs([ commandName, taskEditPopup.cpTaskID ]), page === employeePage);
    };
    function taskCancelButton_Click(s, e) {
        taskEditPopup.Hide();
    };
    function customerSaveButton_Click(s, e) { // TODO rename CustomerEmployeeForm(Button)_Click
        saveEditForm(customerEmployeeEditPopup, serializeArgs([ customerEmployeeEditPopup.cpCustomerEmployeeID ]), true);
    };
    function customerCancelButton_Click(s, e) {
        customerEmployeeEditPopup.Hide();
    };
    function revenueAnalysisCloseButton_Click(s, e) {
        revenueAnalysisPopup.Hide();
    };

    function getViewModeCore(key) {
        return ASPxClientUtils.GetCookie(key);
    };
    function setViewModeCore(key, value) {
        ASPxClientUtils.SetCookie(key, value);
    };
    function showEditMessagePopup(messageTemplate, operation) {
        var message = messageTemplate.replace("<<Operation>>", operation);
        editMessagePopup.SetContentHtml(message);
        editMessagePopup.Show();
    };
    function checkReadOnlyMode() {
        if(window.readOnlyPopup) { // TODO use hiddenField and one popupControl to readOnly and edit message
            readOnlyPopup.Show();
            return true;
        }
        return false;
    };
    function showClearedPopup(popup) {
        popup.Show();
        ASPxClientEdit.ClearEditorsInContainer(document.getElementById("EditFormsContainer"));
    };

    function getAttribute(element, attrName) {
        if(element.getAttribute)
            return element.getAttribute(attrName);
        else if(element.getProperty)
            return element.getProperty(attrName);
    };

    function saveEditForm(popup, args, isDetail) {
        if(!ASPxClientEdit.ValidateEditorsInContainer(popup.GetMainElement()))
            return;
        popup.Hide();
        if(checkReadOnlyMode())
            return;
        var callbackArgs = ["SaveEditForm", popup.cpEditFormName, args];
        var panel = isDetail ? detailsCallbackPanel : mainCallbackPanel;
        callbackHelper.DoCallback(panel, serializeArgs(callbackArgs), popup);
    };

    function showRevenueAnalysis() {
        revenueAnalysisPopup.Show();
    };

    function openPageViewerPopup(reportName, itemID) {
        pageViewerPopup.SetContentHtml("");
        pageViewerPopup.SetHeaderText(pageViewerPopup.cpReportDisplayNames[reportName]);
        pageViewerPopup.PerformCallback(serializeArgs([ reportName, itemID ]));
        pageViewerPopup.Show();
    };

    var dashboardPage = (function() {
        function toolbarMenu_ItemClick(s, e) {
            switch(e.item.name) {
                case "RevenueAnalysis":
                case "RevenueSnapshot":
                case "OpportunitiesSnapshot":
                    $panel = $("#" + e.item.name);
                    if(e.item.GetChecked())
                        $panel.parent().show();
                    else
                        $panel.parent().hide();
            }
        }
        function chartPanel_CloseClick(closeBtn) {
            $panel = $(closeBtn).parents(".card");
            $panel.parent().hide();
            mainToolbar.GetItemByName($panel.attr("id")).SetChecked(false);
        }

        return {
            ChartPanel_CloseClick: chartPanel_CloseClick,
            ToolbarMenu_ItemClick: toolbarMenu_ItemClick
        };
    })();

    var employeePage = (function() {
        function toolbarMenu_ItemClick(s, e) {
            var employeeID = getSelectedEmployeeID();
            if(!employeeID)
                return;
            var name = e.item.name;
            switch(name) {
                case "GridView":
                    if(isGridViewMode())
                        return;
                    setViewMode(name);
                    callbackHelper.DoCallback(mainCallbackPanel, "", s, disableToolbarMenu, enableToolbarMenu);
                    break;
                case "CardsView":
                    if(!isGridViewMode())
                        return;
                    setViewMode(name);
                    callbackHelper.DoCallback(mainCallbackPanel, "", s, disableToolbarMenu, enableToolbarMenu);
                    break;
                case "New":
                    addEmployee();
                    break;
                case "Delete":
                    deleteEmployee(employeeID, s);
                    break;
                case "Meeting":
                    showEditMessagePopup(editMessagePopup.cpEmployeeEditMessageTemplate, "create new meeting");
                    break;
                case "Task":
                    addTask(employeeID, s);
                    break;
            }
        }
        function enableToolbarMenu() {
            mainToolbar.SetEnabled(true);
        }
        function disableToolbarMenu() {
            mainToolbar.SetEnabled(false);
        }

        function employeesGrid_Init(s, e) {
        }
        function employeesGrid_FocusedRowChanged(s, e) {
            updateDetailInfo(s);
        }
        function employeesGrid_EndCallback(s, e) {
            updateDetailInfo(s); // TODO check this case
        }

        function gridEditButton_Click(e) {
            var src = ASPxClientUtils.GetEventSource(e);
            editEmployee(src.id);
        };

        function addEmployee() {
            employeeEditPopup.SetHeaderText("New Employee");
            showClearedPopup(employeeEditPopup);
            firstNameTextBox.Focus();
        }
        function editEmployee(id) { 
            showClearedPopup(employeeEditPopup);
            callbackHelper.DoCallback(employeeEditPopup, id, employeeEditPopup);
        }
        function deleteEmployee(id, sender) {
            if(checkReadOnlyMode())
                return;
            if(confirm("Remove employee?"))
                callbackHelper.DoCallback(mainCallbackPanel, serializeArgs(["DeleteEntry", id]), sender);
        }
        
        function employeeEditButton_Click(employeeId) {
            editEmployee(employeeId);
        }

        function evaluationGrid_CustomButtonClick(s, e) {
            if(e.buttonID === "EvaluationEditBtn")
                editEvaluation(s.GetRowKey(e.visibleIndex), s);
            if(e.buttonID === "EvaluationDeleteBtn") {
                if(checkReadOnlyMode())
                        return;
                if(confirm("Remove Evaluation?")) {
                    var rowIndex = s.GetFocusedRowIndex();
                    callbackHelper.DoCallback(detailsCallbackPanel, serializeArgs(["DeleteEntry", "Evaluation", rowIndex >= 0 ? s.GetRowKey(rowIndex) : ""]), s);
                }
            }
        }

        function taskGrid_CustomButtonClick(s, e) {
            if(e.buttonID === "EditBtn")
                editTask(s.GetRowKey(e.visibleIndex), s);
            if(e.buttonID === "DeleteBtn") {
                if(checkReadOnlyMode())
                    return;
                if(confirm("Remove Task?")) {
                    var rowIndex = s.GetFocusedRowIndex();
                    callbackHelper.DoCallback(detailsCallbackPanel, serializeArgs(["DeleteEntry", "Task", rowIndex >= 0 ? s.GetRowKey(rowIndex) : ""]), s);
                }
            }
        }

        function editEvaluation(id, sender) {
            showClearedPopup(evaluationEditPopup);
            callbackHelper.DoCallback(evaluationEditPopup, id, sender);
        }
        function getSelectedEmployeeID() {
            var getIndex, getKey;
            try {
                if(isGridViewMode()) {
                    getIndex = employeesGrid.GetFocusedRowIndex.aspxBind(employeesGrid);
                    getKey = employeesGrid.GetRowKey.aspxBind(employeesGrid);
                } else {
                    getIndex = employeeCardView.GetFocusedCardIndex.aspxBind(employeeCardView);
                    getKey = employeeCardView.GetCardKey.aspxBind(employeeCardView);
                }
                if(getIndex() >= 0)
                    return getKey(getIndex()); 
            } catch(e) {
            }
            return null;
        }
        function getViewMode() {
            return getViewModeCore("EmployeeViewMode");
        };
        function setViewMode(value) {
            setViewModeCore("EmployeeViewMode", value);
        };
        function isGridViewMode() {
            var viewMode = getViewMode();
            return !viewMode || viewMode === "GridView";
        };
        function getSelectedItemID() {
            return getSelectedEmployeeID();
        }

    return {
        ToolbarMenu_ItemClick: toolbarMenu_ItemClick,
        EmployeesGrid_Init: employeesGrid_Init,
        EmployeesGrid_FocusedRowChanged: employeesGrid_FocusedRowChanged,
        EmployeesGrid_EndCallback: employeesGrid_EndCallback,
        GridEditButton_Click: gridEditButton_Click,
        EmployeeEditButton_Click: employeeEditButton_Click,
        EvaluationGrid_CustomButtonClick: evaluationGrid_CustomButtonClick,
        TaskGrid_CustomButtonClick: taskGrid_CustomButtonClick,
        GetSelectedItemID: getSelectedItemID,
        IsGridViewMode: isGridViewMode
    }; 
    })();

    var customerPage = (function() {
        function toolbarMenu_ItemClick(s, e) {
            switch(e.item.name) {
                case "New":
                    showEditMessagePopup(editMessagePopup.cpEditMessageTemplate, "insert new customer");
                    break;
                case "Delete":
                    showEditMessagePopup(editMessagePopup.cpEditMessageTemplate, "delete customer");
                    break;
                case "ShowRevenueAnalysis":
                    showRevenueAnalysis();
                    break;
            }
        }

        function gridEditButton_Click(e) {
            showEditMessagePopup(editMessagePopup.cpEditMessageTemplate, "edit customer's");
        };

        function customerGrid_FocusedRowChanged(s, e) {
            updateDetailInfo(s);
        }

        function customerEmployeeButton_Click(customerEmployeeID) {
            startEditCustomerEmployee(customerEmployeeID);
        }
        function startEditCustomerEmployee(id) {
            showClearedPopup(customerEmployeeEditPopup);
            callbackHelper.DoCallback(customerEmployeeEditPopup, id, customerEmployeeEditPopup);
        }
        function sliderMenu_ItemClick(s, e) {
            if(e.item.name === "Root")
                return;
            ASPxClientUtils.SetCookie("CustomerImageSliderMode", e.item.name);
            updateDetailInfo(s);
        }

        function getSelectedItemID() {
            var rowIndex = customerGrid.GetFocusedRowIndex();
            return rowIndex >= 0 ? customerGrid.GetRowKey(rowIndex) : null;
        }

        return {
            ToolbarMenu_ItemClick: toolbarMenu_ItemClick,
            GridEditButton_Click: gridEditButton_Click,
            CustomerGrid_FocusedRowChanged: customerGrid_FocusedRowChanged,
            CustomerEmployeeButton_Click: customerEmployeeButton_Click,
            SliderMenu_ItemClick: sliderMenu_ItemClick,
            GetSelectedItemID: getSelectedItemID
        };
    })();

    var productPage = (function() {
        function toolbarMenu_ItemClick(s, e) { 
            var name = e.item.name;
            switch(name) {
                case "New":
                    showEditMessagePopup(editMessagePopup.cpEditMessageTemplate, "insert new product");
                    break;
                case "Delete":
                    showEditMessagePopup(editMessagePopup.cpEditMessageTemplate, "delete product");
                    break;
                case "ShowRevenueAnalysis":
                    showRevenueAnalysis();
                    break;
            }
        }
        function productGrid_FocusedRowChanged(s, e) {
            updateDetailInfo(s);
        }
        function productImageSlider_ThumbnailItemClick(s, e) {
            callbackHelper.DoCallback(productPopup, s.GetActiveItemIndex(), s);
            productPopup.Show();
        }
        function productImageUpload_FileUploadStart(s, e) {
            e.cancel = checkReadOnlyMode();
        }
        function productImageUpload_FileUploadComplete(s, e) {
            updateDetailInfo(s);
        }
        function productUploadButton_Click(s, e) {
            productImageUpload.Upload();
        }
        function getSelectedItemID() {
            var rowIndex = productGrid.GetFocusedRowIndex();
            return rowIndex >= 0 ? productGrid.GetRowKey(rowIndex) : null;
        }

        return {
            ToolbarMenu_ItemClick: toolbarMenu_ItemClick,
            ProductGrid_FocusedRowChanged: productGrid_FocusedRowChanged,
            ProductImageSlider_ThumbnailItemClick: productImageSlider_ThumbnailItemClick,
            ProductImageUpload_FileUploadStart: productImageUpload_FileUploadStart,
            ProductImageUpload_FileUploadComplete: productImageUpload_FileUploadComplete,
            ProductUploadButton_Click: productUploadButton_Click,
            GetSelectedItemID: getSelectedItemID
        };
    })();

    var taskPage = (function() {
        function toolbarMenu_ItemClick(s, e) { 
            var name = e.item.name;
            switch(name) {
                case "GridView":
                    if(isGridViewMode())
                        return;
                    setViewMode("GridView");
                    callbackHelper.DoCallback(mainCallbackPanel, "", s);
                    break;
                case "CardsView":
                    if(!isGridViewMode())
                        return;
                    setViewMode("CardsView");
                    callbackHelper.DoCallback(mainCallbackPanel, "", s);
                    break;
                case "New":
                    taskEditPopup.SetHeaderText("New Task");
                    addTask("", s);
                    break;
            }
        }
        function taskGrid_CustomButtonClick(s, e) {
            switch(e.buttonID) {
                case "EditBtn":
                    editTask(s.GetRowKey(e.visibleIndex), s);
                    break;
                case "DeleteBtn":
                    deleteTask(s.GetRowKey(e.visibleIndex), s);
                    break;
            }
        }

        function viewButton_Click(s, e) {
            performTaskCommand("Show", s.cpTaskID, s);
        }
        function editButton_Click(s, e) {
            editTask(s.cpTaskID, s);
        }
        function deleteButton_Click(s, e) {
            deleteTask(s.cpTaskID, s);
        }

        function getViewMode() {
            return getViewModeCore("TaskViewMode");
        }
        function setViewMode(value) {
            setViewModeCore("TaskViewMode", value);
        }
        function isGridViewMode() {
            var viewMode = getViewMode();
            return !viewMode || viewMode === "GridView";
        }
        return {
            ToolbarMenu_ItemClick: toolbarMenu_ItemClick,
            TaskGrid_CustomButtonClick: taskGrid_CustomButtonClick,
            ViewButton_Click: viewButton_Click,
            EditButton_Click: editButton_Click,
            DeleteButton_Click: deleteButton_Click,
            IsGridViewMode: isGridViewMode
        };
    })();

    function getCurrentPage() {
        var pageName = DevAVPageName;
        switch(pageName) {
            case "Dashboard":
                return dashboardPage;
            case "Employees":
                return employeePage;
            case "Customers":
                return customerPage;
            case "Products":
                return productPage;
            case "Tasks":
                return taskPage;
        }
    };
    var page = getCurrentPage();
    var THEME_COOKIE_KEY = "DXDevAVCurrentTheme";

    function gridEditButton_Click(event) {
        page.GridEditButton_Click(event);
        ASPxClientUtils.PreventEventAndBubble(event);
    }

    function filterNavBar_Init(s, e) {
        loadFilterNavBarSelectedItem();
    };
    function filterNavBar_ItemClick(s, e) {
        if(e.item.name !== s.cpPrevSelectedItemName)
            changeFilter(s.cpFilterExpressions[e.item.name], s);
    };
    
    function searchBox_KeyDown(s, e) {
        window.clearTimeout(searchBoxTimer);
        searchBoxTimer = window.setTimeout(function() { onSearchTextChanged(s); }, 1200);
        e = e.htmlEvent;
        if(e.keyCode === 13) {
            if(e.preventDefault)
                e.preventDefault();
            else
                e.returnValue = false;
        }
    };
    function searchBox_TextChanged(s, e) {
        onSearchTextChanged(s);
    };
    function onSearchTextChanged(sender) {
        window.clearTimeout(searchBoxTimer);
        var searchText = searchBox.GetText();
        if(hiddenField.Get("SearchText") == searchText)
            return;
        hiddenField.Set("SearchText", searchText);
        callbackHelper.DoCallback(mainCallbackPanel, serializeArgs( ["Search"] ), sender);
    };


    function mainCallbackPanel_EndCallback(s, e) {
        if(s.cpSelectedFilterNavBarItemName)
            updateFilterNavBarSelection(s.cpSelectedFilterNavBarItemName);
    }

    function toolbarMenu_ItemClick(s, e) {
        var name = e.item.name;
        var selectedItemID = page.GetSelectedItemID && page.GetSelectedItemID();
        if(name === "Print" || e.item.parent && e.item.parent.name === "Print")
            openPageViewerPopup(s.cpReportNames[name], selectedItemID);

        page.ToolbarMenu_ItemClick(s, e);
    }

    function updateFilterNavBarSelection(selectedItemName) {
        var oldItem = filterNavBar.GetSelectedItem();
        var newItem = filterNavBar.GetItemByName(selectedItemName);
        if(oldItem && newItem && filterNavBar.cpFilterExpressions[oldItem.name] === filterNavBar.cpFilterExpressions[newItem.name])
            return;
        filterNavBar.SetSelectedItem(newItem);
        loadFilterNavBarSelectedItem();
    }
    
    function changeFilter(expression, sender) {
        callbackHelper.DoCallback(mainCallbackPanel, serializeArgs([ "FilterChanged", expression ]), sender);
        loadFilterNavBarSelectedItem();
    }

    function loadFilterNavBarSelectedItem() {
        var item = filterNavBar.GetSelectedItem();
        filterNavBar.cpPrevSelectedItemName = item ? item.name : "";
    }

    function serializeArgs(args) {
        var result = [];
        for(var i = 0; i < args.length; i++) {
            var value = args[i] ? args[i].toString() : "";
            result.push(value.length);
            result.push("|");
            result.push(value);
        }
        return result.join("");
    }
    function setAttribute(element, attrName, value) {
        if(element.setAttribute)
            element.setAttribute(attrName, value);
        else if(element.setProperty)
            element.setProperty(attrName, value, "");
    }

    function employeeEditPopup_EndCallback(s, e) {
        s.SetHeaderText(s.cpHeaderText);
        firstNameTextBox.Focus();
    }
    function evaluationEditPopup_EndCallback(s, e) {
        s.SetHeaderText(s.cpHeaderText);
        evaluationSubjectTextBox.Focus();
    }
    function taskEditPopup_EndCallback(s, e) {
        s.SetHeaderText(s.cpHeaderText);
        OwnerComboBox.Focus();
    }
    function customerEditPopup_EndCallback(s, e) {
        s.SetHeaderText(s.cpHeaderText);
        firstNameTextBox.Focus();
    }
    function removeThemeClass(index, className) {
        return (className.match(/(^|\s)theme-\S+/g) || []).join(' ');
    }
    function adjustControlsInWindow(windowRef) {
        windowRef.ASPxClientControl.AdjustControls(windowRef.document.body);
    }
    function mainMenu_ItemClick(s, e) {
        var theme = e.item.parent.parent ? e.item.name : null; // themes submenu
        if(theme) {
            $(window.top.document.body).fadeOut(200, function() {
                var path = "Content/themes/" + theme + "/bootstrap.min.css";

                var $themeLink = $("#themeLink");
                $themeLink.attr("href", path);

                $body = $(document.body);
                $body.removeClass(removeThemeClass);
                $body.addClass("theme-" + theme.toLowerCase().replace("/", "-"));

                $(window.top.document.body).fadeIn(300, function() {
                    BootstrapClientUtils.UpdateDefaultStyles();
                    adjustControlsInWindow(window);
                });
            });
            ASPxClientUtils.SetCookie(THEME_COOKIE_KEY, theme);
        }
    }
    
    return { 
        Page: page,
        MainMenu_ItemClick: mainMenu_ItemClick,
        FilterNavBar_Init: filterNavBar_Init,
        FilterNavBar_ItemClick: filterNavBar_ItemClick,
        SearchBox_KeyDown: searchBox_KeyDown,
        SearchBox_TextChanged: searchBox_TextChanged,
        MainCallbackPanel_EndCallback: mainCallbackPanel_EndCallback,
        RevenueAnalysisCloseButton_Click: revenueAnalysisCloseButton_Click,
        ToolbarMenu_ItemClick: toolbarMenu_ItemClick,
        GridEditButton_Click: gridEditButton_Click,
        CardView_Init: cardView_Init,
        CardView_EndCallback: cardView_EndCallback,
        EmployeeCancelButton_Click: employeeCancelButton_Click,
        EmployeeSaveButton_Click: employeeSaveButton_Click,
        EvaluationSaveButton_Click: evaluationSaveButton_Click,
        EvaluationCancelButton_Click: evaluationCancelButton_Click,
        TaskSaveButton_Click: taskSaveButton_Click,
        TaskCancelButton_Click: taskCancelButton_Click,
        CustomerCancelButton_Click: customerCancelButton_Click,
        CustomerSaveButton_Click: customerSaveButton_Click,
        EmployeeEditPopup_EndCallback: employeeEditPopup_EndCallback,
        EvaluationEditPopup_EndCallback: evaluationEditPopup_EndCallback,
        TaskEditPopup_EndCallback: taskEditPopup_EndCallback,
        CustomerEditPopup_EndCallback: customerEditPopup_EndCallback
    }; 
})();