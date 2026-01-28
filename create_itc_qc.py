import pandas as pd
import os

def create_itc_qc():
    # Define Column Mappings based on User Data Snippet
    c_geo_area = "Total Geographical Area (ha)"
    c_agri_area = "Total Agriculture Area (ha)"
    c_sowing1 = "Sowing 1 Area (ha)"
    c_sowing1_pct = "Sowing 1 Percentage"
    c_sowing2 = "Sowing2 Area (ha)"  # Note: Sowing2 without space in name based on snippet, check carefully. 
    # Actually snippet says "Sowing 2 Percentage" but "Sowing2 Area (ha)". Let's assume user text is correct.
    # Wait, looking at snippet: "Sowing2 Area (ha)" and "Sowing 2 Percentage".
    c_sowing2_pct = "Sowing 2 Percentage"
    c_sowing3 = "Sowing 3 Area (ha)"
    c_sowing3_pct = "Sowing 3 Percentage"
    
    # Crop specific
    c_crop_acren = "Crop  Area (ha) K025" # Double space in snippet? "Crop  Area"
    c_crop_acre_pct = "Crop  Area Percentage K025"
    
    c_harv1 = "Harvest 1 Area(ha)"
    c_harv1_pct = "Harvest 1 Area Percentage"
    c_harv2 = "Harvest 2 Area(ha)"
    c_harv2_pct = "Harvest 2 Area Percentage"
    c_harv3 = "Harvest 3 Area (ha)"
    c_harv3_pct = "Harvest 3 Area Percentage"
    c_harv4 = "Harvest 4 Area (ha)"
    c_harv4_pct = "Harvest 4 Area Percentage"

    # 1. QC Sheet (Comprehensive Rules)
    # Header: QC_Check_Name, Level, Target_Column, Aggregation, Condition, Compare_Against, Is_Compare_Column
    rules_data = [
        # Sowing 1
        ["Sowing 1 vs Geographical", "Row", c_agri_area, "", "<=", c_geo_area, "Yes"],
        ["Sowing 1 vs Agri Area", "Row", c_sowing1, "", "<=", c_agri_area, "Yes"],
        ["Sowing 1 % Max", "Row", c_sowing1_pct, "", "<=", "100", "No"],
        ["Sowing 1 % Min", "Row", c_sowing1_pct, "", ">=", "0", "No"],
        
        # Sowing 2
        ["Sowing 2 vs Agri Area", "Row", c_sowing2, "", "<=", c_agri_area, "Yes"],
        ["Sowing 2 vs Sowing 1", "Row", c_sowing2, "", ">=", c_sowing1, "Yes"],
        ["Sowing 2 % Max", "Row", c_sowing2_pct, "", "<=", "100", "No"],
        ["Sowing 2 % Min", "Row", c_sowing2_pct, "", ">=", "0", "No"],
        
        # Sowing 3
        ["Sowing 3 vs Agri Area", "Row", c_sowing3, "", "<=", c_agri_area, "Yes"],
        ["Sowing 3 vs Sowing 2", "Row", c_sowing3, "", ">=", c_sowing2, "Yes"],
        ["Sowing 3 % Max", "Row", c_sowing3_pct, "", "<=", "100", "No"],
        ["Sowing 3 % Min", "Row", c_sowing3_pct, "", ">=", "0", "No"],

        # Crop Acreage
        ["Acreage vs Agri Area", "Row", c_crop_acren, "", "<=", c_agri_area, "Yes"],
        ["Acreage vs Sowing 3", "Row", c_crop_acren, "", "<=", c_sowing3, "Yes"],
        ["Acreage % Max", "Row", c_crop_acre_pct, "", "<=", "100", "No"],
        ["Acreage % Min", "Row", c_crop_acre_pct, "", ">=", "0", "No"],

        # Crop Harvest 1
        ["Harvest 1 vs Agri Area", "Row", c_harv1, "", "<=", c_agri_area, "Yes"],
        ["Harvest 1 vs Acreage", "Row", c_harv1, "", "<=", c_crop_acren, "Yes"],
        ["Harvest 1 % Max", "Row", c_harv1_pct, "", "<=", "100", "No"],

        # Crop Harvest 2
        ["Harvest 2 vs Agri Area", "Row", c_harv2, "", "<=", c_agri_area, "Yes"],
        ["Harvest 2 vs Acreage", "Row", c_harv2, "", "<=", c_crop_acren, "Yes"],
        ["Harvest 2 vs Harvest 1", "Row", c_harv2, "", ">=", c_harv1, "Yes"],
        ["Harvest 2 % Max", "Row", c_harv2_pct, "", "<=", "100", "No"],

        # Crop Harvest 3
        ["Harvest 3 vs Agri Area", "Row", c_harv3, "", "<=", c_agri_area, "Yes"],
        ["Harvest 3 vs Acreage", "Row", c_harv3, "", "<=", c_crop_acren, "Yes"],
        ["Harvest 3 vs Harvest 2", "Row", c_harv3, "", ">=", c_harv2, "Yes"],
        ["Harvest 3 % Max", "Row", c_harv3_pct, "", "<=", "100", "No"],

        # Crop Harvest 4
        ["Harvest 4 vs Agri Area", "Row", c_harv4, "", "<=", c_agri_area, "Yes"],
        ["Harvest 4 vs Acreage", "Row", c_harv4, "", "<=", c_crop_acren, "Yes"],
        ["Harvest 4 vs Harvest 3", "Row", c_harv4, "", ">=", c_harv3, "Yes"],
        ["Harvest 4 % Max", "Row", c_harv4_pct, "", "<=", "100", "No"],

        # Aggregate Level Checks
        ["Total Agri Area vs Geographical", "Agg", c_agri_area, "Sum", "<=", c_geo_area, "Yes"],
        ["Total Acreage vs Sowing 3", "Agg", c_crop_acren, "Sum", "<=", c_sowing3, "Yes"]
    ]
    
    df_qc = pd.DataFrame(rules_data, columns=[
        "QC_Check_Name", "Level", "Target_Column", "Aggregation", "Condition", "Compare_Against", "Is_Compare_Column"
    ])
    
    # Escape Operators for visibility
    df_qc["Condition"] = df_qc["Condition"].apply(lambda x: f"'{x}")

    # 2. Operators (Legend) Sheet
    operators = {
        "Category": ["Logical", "Logical", "Logical", "Logical", "Logical", "Logical", "Aggregate", "Aggregate", "Aggregate", "Aggregate", "Aggregate"],
        "Type": ["'<=", "'>=", "'==", "'!=", "'<", "'>", "Sum", "Avg", "Min", "Max", "Count"],
        "Description": [
            "Less than or Equal to",
            "Greater than or Equal to",
            "Exactly Equal to",
            "Not Equal to",
            "Strictly Less than",
            "Strictly Greater than",
            "Total sum of all values",
            "Average of all values",
            "Lowest value in column",
            "Highest value in column",
            "Number of entries"
        ]
    }
    df_legend = pd.DataFrame(operators)

    # Export
    path = os.path.abspath("ITC_QC.xlsx")
    try:
        if os.path.exists(path):
            os.remove(path) # Try to remove if exists
        
        with pd.ExcelWriter(path) as writer:
            df_qc.to_excel(writer, sheet_name="QC", index=False)
            df_legend.to_excel(writer, sheet_name="Operators", index=False)
        print(f"ITC Rules created at: {path}")
    except PermissionError:
        print(f"ERROR: Could not write to {path}. Please close the Excel file if it is open.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    create_itc_qc()
